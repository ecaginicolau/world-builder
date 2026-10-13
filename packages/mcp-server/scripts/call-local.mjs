import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = fileURLToPath(new URL('../../../', import.meta.url));
const client = new Client({name:'print-production',version:'1'});
const transport = new StdioClientTransport({command:process.execPath,args:[path.join(root,'packages/mcp-server/start-local.mjs')],cwd:root,stderr:'pipe',env:Object.fromEntries(Object.entries(process.env).filter(([,v])=>v!==undefined))});
try {
  await client.connect(transport);
  const requests = JSON.parse(await readFile(process.argv[2], 'utf8'));
  for (const request of requests) {
    const response = request.name === 'list_tools' ? await client.listTools() : await client.callTool({name:request.name,arguments:request.arguments ?? {}},undefined,{timeout:240000});
    if (request.output) {
      const destination=path.resolve(root,request.output);
      await mkdir(path.dirname(destination),{recursive:true});
      await writeFile(destination,JSON.stringify(response,null,2));
    }
    console.log(JSON.stringify({name:request.name,...(request.quiet ? {isError:response.isError??false,output:request.output} : {response})}));
    if(response.isError) process.exitCode=1;
  }
} finally {await client.close();}
