create extension if not exists vector;

create index if not exists documents_content_type_idx
  on public.documents (content_type);

create index if not exists sections_document_id_idx
  on public.sections (document_id);

do $$
declare
  embedding_udt text;
begin
  select c.udt_name
  into embedding_udt
  from information_schema.columns c
  where c.table_schema = 'public'
    and c.table_name = 'sections'
    and c.column_name = 'embedding'
  limit 1;

  if embedding_udt = 'vector' then
    execute '
      create index if not exists sections_embedding_cosine_idx
      on public.sections
      using ivfflat (embedding vector_cosine_ops)
      with (lists = 100)
    ';
  end if;
end;
$$;

create or replace function public.match_document_sections (
  query_embedding vector,
  match_count integer default 6,
  match_content_types text[] default null
)
returns table (
  section_id bigint,
  document_id bigint,
  document_title text,
  content_type text,
  section_title text,
  section_content text,
  similarity double precision,
  section_metadata jsonb
)
language sql
stable
as $$
  select
    s.id as section_id,
    d.id as document_id,
    d.title as document_title,
    d.content_type,
    s.title as section_title,
    s.content as section_content,
    1 - (s.embedding <=> query_embedding) as similarity,
    '{}'::jsonb as section_metadata
  from public.sections s
  join public.documents d
    on d.id = s.document_id
  where s.embedding is not null
    and (
      match_content_types is null
      or cardinality(match_content_types) = 0
      or d.content_type = any(match_content_types)
    )
  order by s.embedding <=> query_embedding
  limit greatest(match_count, 1);
$$;
