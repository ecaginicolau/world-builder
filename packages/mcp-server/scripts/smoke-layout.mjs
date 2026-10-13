import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { withPrintBrowser, artifactRoot } from '../dist/print/runtime.js';

if (!process.argv.includes('--live')) throw new Error('Pass --live to create and clean isolated Supabase test fixtures.');
const root = fileURLToPath(new URL('../../../', import.meta.url));
const environment = JSON.parse(await readFile(path.join(root,'.mcp.json'),'utf8')).mcpServers['world-builder'].env;
const db = createClient(environment.SUPABASE_URL, environment.SUPABASE_SERVICE_ROLE_KEY, {auth:{persistSession:false,autoRefreshToken:false}});
const owner = environment.OWNER_USER_ID;
const run = randomUUID(); const world = randomUUID(); const entity = randomUUID(); const type = randomUUID();
const dir = path.join(artifactRoot, 'smoke-'+run); await mkdir(dir,{recursive:true});
const report = {run, started_at:new Date().toISOString(), checks:[], cleanup:false};
const storagePaths=[];
let client; let transport; let createdWorld=false;
async function connect() {
  transport = new StdioClientTransport({command:process.execPath,args:[path.join(root,'packages/mcp-server/start-local.mjs')],cwd:root,stderr:'pipe',env:Object.fromEntries(Object.entries(process.env).filter(([,v])=>v!==undefined))});
  client = new Client({name:'world-builder-layout-smoke',version:'1'});
  await client.connect(transport);
  const tools = await client.listTools();
  assert(tools.tools.some(t=>t.name==='edit_chapter_layout'));
  return transport.pid;
}
async function call(name,args,expectFailure=false) {
  const response=await client.callTool({name,arguments:args},undefined,{timeout:240000});
  const result=JSON.parse(response.content.find(c=>c.type==='text').text);
  if(expectFailure) {assert(response.isError||!result.ok,`${name} unexpectedly succeeded`); return result;}
  assert(result.ok&&!response.isError,`${name}: ${result.error??JSON.stringify(result.data?.preflight)}`);
  return result.data;
}
async function query(q) {const {data,error}=await q; if(error)throw new Error(error.message);return data;}
async function current(id) {const c=await query(db.from('chapters').select('*').eq('id',id).eq('owner_id',owner).single());const v=await query(db.from('chapter_versions').select('*').eq('id',c.final_version_id).eq('owner_id',owner).single());return {c,v};}
const check = name => {report.checks.push(name);console.log('PASS '+name);};
try {
  const pid=await connect(); await client.close(); const nextPid=await connect();assert.notEqual(pid,nextPid);check('stdio server starts, stops and reconnects with print tools');
  await query(db.from('worlds').insert({id:world,owner_id:owner,name:'TEMP MCP layout smoke '+run}));createdWorld=true;
  await query(db.from('entity_types').insert({id:type,world_id:world,owner_id:owner,name:'Test image',fields:[]}));
  await query(db.from('entities').insert({id:entity,world_id:world,owner_id:owner,entity_type_id:type,name:'Temporary print reference'}));
  const book=await call('create_book',{world_id:world,title:'TEMP MCP print test'});
  const part=await call('create_part',{book_id:book.id,title:'Test'});
  const prose='<p>Élise &amp; <em>les ombres</em>.</p><p>Un deuxième paragraphe intact.</p><p>Fin du test.</p>';
  const chapter=await call('create_chapter',{part_id:part.id,title:'Test publié',first_event_title:'Temporary event',draft:prose});
  await call('update_chapter',{chapter_id:chapter.id,status:'published'});
  const color=await call('create_book_edition',{book_id:book.id,settings:{name:'Test 6x9 couleur'}});
  const mono=await call('create_book_edition',{book_id:book.id,copy_from_edition_id:color.id,settings:{name:'Test 5x8 gris',trim_width_mm:127,trim_height_mm:203.2,image_grayscale:true}});
  const updated=await call('update_book_edition',{edition_id:mono.id,expected_updated_at:mono.updated_at,settings:{image_brightness:105}});
  assert.equal(updated.trim_width_mm,127);assert.equal(updated.image_grayscale,true);check('edition creation, copy and partial update');
  const pngs=await withPrintBrowser(page=>page.evaluate(()=>['#b43125','#234fac'].map(color=>{const canvas=document.createElement('canvas');canvas.width=1800;canvas.height=2400;const ctx=canvas.getContext('2d');ctx.fillStyle=color;ctx.fillRect(0,0,1800,2400);return canvas.toDataURL().split(',')[1];})));
  const images=[];
  for(let i=0;i<pngs.length;i++){
    const imageId=randomUUID();const filename=path.join(dir,`image-${i}.png`);await writeFile(filename,Buffer.from(pngs[i],'base64'));
    storagePaths.push(`${world}/${entity}/${imageId}.png`);
    images.push(await call('upload_illustration',{entity_id:entity,image_id:imageId,file_path:filename}));
    const retry=await call('upload_illustration',{entity_id:entity,image_id:imageId,file_path:filename});assert.equal(retry.reused,true);
  }
  check('Chromium decodes images; uploads are idempotent');
  let layout=await call('get_chapter_layout',{chapter_id:chapter.id});const original=await current(chapter.id);
  const args={chapter_id:chapter.id,expected_revision:layout.revision,opening_illustration_id:images[0].id,insert:[{before_block:1,kind:'full_page',illustration_id:images[1].id},{before_block:2,kind:'page_break'}]};
  await call('edit_chapter_layout',{...args,dry_run:true});assert.equal((await current(chapter.id)).v.id,original.v.id);check('dry run does not write');
  const change=await call('edit_chapter_layout',args);assert.notEqual(change.final_version_id,original.v.id);
  let state=await current(chapter.id);assert.equal(state.c.status,'published');assert.equal(state.v.parent_version_id,original.v.id);
  assert.equal(state.v.text.replace(/<div data-page-break="true"[^>]*><\/div>/g,''),prose);assert.equal(state.c.opening_illustration_id,images[0].id);
  assert.equal((await query(db.from('chapter_versions').select('text').eq('id',original.v.id).single())).text,prose);check('published chapter layout writes preserve prose and previous version');
  await call('edit_chapter_layout',args,true);check('stale MCP revision is rejected');
  const stale=await db.rpc('mcp_edit_chapter_layout',{p_owner_id:owner,p_chapter_id:chapter.id,p_expected_updated_at:original.c.updated_at,p_expected_version_id:original.v.id,p_expected_text:original.v.text,p_text:'<p>Must not be written</p>',p_opening_illustration_id:null,p_rank:'zz'});
  assert(stale.error);assert.equal((await current(chapter.id)).v.id,change.final_version_id);check('SQL transaction also rejects stale writes');
  const usage=await call('get_book_illustration_usage',{book_id:book.id});assert.equal(usage.uses.length,2);assert.equal(usage.missing_ids.length,0);check('book usage resolves both placements');
  const preview=await call('generate_print_pdf',{edition_id:color.id,chapter_id:chapter.id,expected_illustrations_per_chapter:2});assert.equal(preview.preflight.errors.length,0);
  await call('get_print_pdf_page',{export_id:preview.export_id,page_number:1});
  const full=await call('generate_print_pdf',{edition_id:mono.id,expected_illustrations_per_chapter:2});assert.equal(full.preflight.errors.length,0);
  check('chapter/color and book/monochrome PDF previews after live layout writes');
  layout=await call('get_chapter_layout',{chapter_id:chapter.id});
  await call('edit_chapter_layout',{chapter_id:chapter.id,expected_revision:layout.revision,remove_blocks:[1],insert:[{before_block:layout.blocks.length,kind:'inline',illustration_id:images[1].id}]});
  layout=await call('get_chapter_layout',{chapter_id:chapter.id});assert.equal(layout.blocks.at(-1).kind,'inline');check('illustration move from full page to inline');
  await call('edit_chapter_layout',{chapter_id:chapter.id,expected_revision:layout.revision,remove_blocks:[0]},true);check('prose block cannot be removed');
  const competing={chapter_id:chapter.id,expected_revision:layout.revision,insert:[{before_block:0,kind:'page_break'}]};
  const concurrent=await Promise.all([client.callTool({name:'edit_chapter_layout',arguments:competing}),client.callTool({name:'edit_chapter_layout',arguments:competing})]);
  assert.equal(concurrent.filter(r=>!r.isError).length,1);check('concurrent edits: exactly one wins');
  layout=await call('get_chapter_layout',{chapter_id:chapter.id});
  await call('edit_chapter_layout',{chapter_id:chapter.id,expected_revision:layout.revision,opening_illustration_id:null,remove_blocks:layout.blocks.filter(b=>b.layout).map(b=>b.index)});
  state=await current(chapter.id);assert.equal(state.v.text,prose);assert.equal(state.c.opening_illustration_id,null);assert.equal(state.c.status,'published');check('removing placements restores exact prose and preserves published status');
  report.success=true;
} catch(e) {report.success=false;report.error=e.message;console.error(e.message);process.exitCode=1;}
finally {
  await client?.close();
  try {
    if(storagePaths.length){const r=await db.storage.from('illustrations').remove(storagePaths);if(r.error)throw new Error(r.error.message);}
    if(createdWorld){
      for(const table of ['books','entities','entity_types'])await query(db.from(table).delete().eq('world_id',world).eq('owner_id',owner));
      await query(db.from('worlds').delete().eq('id',world).eq('owner_id',owner));
      const remaining=await query(db.from('worlds').select('id').eq('id',world));assert.equal(remaining.length,0);
    }
    report.cleanup=true;check('temporary database and storage fixtures removed');
  } catch(e){report.cleanup_error=e.message;console.error('Cleanup: '+e.message);process.exitCode=1;}
  report.finished_at=new Date().toISOString();await writeFile(path.join(dir,'report.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify({success:report.success,cleanup:report.cleanup,report:path.join(dir,'report.json')}));
}
