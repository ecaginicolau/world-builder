-- Atomic layout edits: reject both chapter changes and in-place editor saves.
create or replace function public.mcp_edit_chapter_layout(
  p_owner_id uuid, p_chapter_id uuid, p_expected_updated_at timestamptz,
  p_expected_version_id uuid, p_expected_text text, p_text text,
  p_opening_illustration_id uuid, p_rank text
) returns jsonb language plpgsql security invoker set search_path = public as $$
declare
  c public.chapters%rowtype;
  v public.chapter_versions%rowtype;
  new_id uuid;
begin
  if auth.role() <> 'service_role' and auth.uid() is distinct from p_owner_id then
    raise exception 'Owner mismatch';
  end if;
  select * into c from chapters where id = p_chapter_id and owner_id = p_owner_id for update;
  if not found then raise exception 'Chapter not found'; end if;
  if c.updated_at is distinct from p_expected_updated_at or c.final_version_id is distinct from p_expected_version_id then
    raise exception 'Chapter changed; read layout again';
  end if;
  select * into v from chapter_versions where id = p_expected_version_id and chapter_id = c.id and owner_id = p_owner_id for update;
  if not found or v.text is distinct from p_expected_text then raise exception 'Text changed; read layout again'; end if;
  if p_opening_illustration_id is not null and not exists (
    select 1 from entity_illustrations where id = p_opening_illustration_id and owner_id = p_owner_id and world_id = c.world_id
  ) then raise exception 'Illustration not owned or wrong world'; end if;
  new_id := v.id;
  if p_text is distinct from v.text then
    insert into chapter_versions(chapter_id, world_id, owner_id, rank, parent_version_id, origin, user_prompt, text)
    values(c.id, c.world_id, p_owner_id, p_rank, v.id, 'manual_edit', 'MCP layout-only edit', p_text) returning id into new_id;
  end if;
  update chapters set final_version_id = new_id, opening_illustration_id = p_opening_illustration_id where id = c.id;
  return jsonb_build_object('chapter_id', c.id, 'final_version_id', new_id, 'opening_illustration_id', p_opening_illustration_id);
end;
$$;
revoke all on function public.mcp_edit_chapter_layout(uuid,uuid,timestamptz,uuid,text,text,uuid,text) from public, anon, authenticated;
grant execute on function public.mcp_edit_chapter_layout(uuid,uuid,timestamptz,uuid,text,text,uuid,text) to service_role;
