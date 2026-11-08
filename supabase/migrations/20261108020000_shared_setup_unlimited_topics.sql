create or replace function private.shared_setup_payload_is_valid(
  p_payload jsonb,
  p_include_assessments boolean,
  p_include_topics boolean
)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_semester jsonb;
  v_course jsonb;
  v_assessment jsonb;
  v_topic jsonb;
  v_semester_count integer;
  v_course_count integer := 0;
  v_assessment_count integer;
  v_number numeric;
begin
  if p_payload is null
     or p_include_assessments is null
     or p_include_topics is null
     or pg_catalog.octet_length(p_payload::text) > 262144
     or pg_catalog.jsonb_typeof(p_payload) <> 'object'
     or not (p_payload ?& array['version', 'semesters'])
     or p_payload - array['version', 'semesters'] <> '{}'::jsonb
     or p_payload->>'version' <> '1'
     or pg_catalog.jsonb_typeof(p_payload->'semesters') <> 'array' then
    return false;
  end if;

  v_semester_count := pg_catalog.jsonb_array_length(p_payload->'semesters');
  if v_semester_count < 1 or v_semester_count > 20 then return false; end if;

  for v_semester in
    select value from pg_catalog.jsonb_array_elements(p_payload->'semesters')
  loop
    if pg_catalog.jsonb_typeof(v_semester) <> 'object'
       or not (v_semester ?& array['academicYear', 'semesterNumber', 'courses'])
       or v_semester - array['academicYear', 'semesterNumber', 'courses'] <> '{}'::jsonb
       or not private.is_plain_setup_text(v_semester->>'academicYear', 20)
       or pg_catalog.jsonb_typeof(v_semester->'semesterNumber') <> 'number'
       or pg_catalog.jsonb_typeof(v_semester->'courses') <> 'array' then
      return false;
    end if;

    v_number := (v_semester->>'semesterNumber')::numeric;
    if v_number <> pg_catalog.trunc(v_number)
       or v_number < 1 or v_number > 3
       or pg_catalog.jsonb_array_length(v_semester->'courses') > 50 then
      return false;
    end if;

    for v_course in
      select value from pg_catalog.jsonb_array_elements(v_semester->'courses')
    loop
      v_course_count := v_course_count + 1;
      if v_course_count > 200
         or pg_catalog.jsonb_typeof(v_course) <> 'object'
         or not (v_course ?& array['name', 'creditUnits'])
         or v_course - array[
           'name', 'code', 'creditUnits', 'targetGradePoint', 'assessments', 'topics'
         ] <> '{}'::jsonb
         or not private.is_plain_setup_text(v_course->>'name', 120)
         or pg_catalog.jsonb_typeof(v_course->'creditUnits') <> 'number' then
        return false;
      end if;

      if v_course ? 'code' then
        if pg_catalog.jsonb_typeof(v_course->'code') <> 'string'
           or (v_course->>'code' <> ''
               and not private.is_plain_setup_text(v_course->>'code', 40)) then
          return false;
        end if;
      end if;

      v_number := (v_course->>'creditUnits')::numeric;
      if v_number <> pg_catalog.trunc(v_number) or v_number < 1 or v_number > 6 then
        return false;
      end if;

      if v_course ? 'targetGradePoint' then
        if pg_catalog.jsonb_typeof(v_course->'targetGradePoint') <> 'number' then
          return false;
        end if;
        v_number := (v_course->>'targetGradePoint')::numeric;
        if v_number < 0 or v_number > 5 then return false; end if;
      end if;

      if p_include_assessments then
        if pg_catalog.jsonb_typeof(v_course->'assessments') <> 'array'
           or pg_catalog.jsonb_array_length(v_course->'assessments') > 12 then
          return false;
        end if;
        v_assessment_count := 0;
        for v_assessment in
          select value from pg_catalog.jsonb_array_elements(v_course->'assessments')
        loop
          v_assessment_count := v_assessment_count + 1;
          if pg_catalog.jsonb_typeof(v_assessment) <> 'object'
             or not (v_assessment ?& array['name', 'weight', 'total'])
             or v_assessment - array['name', 'weight', 'total'] <> '{}'::jsonb
             or not private.is_plain_setup_text(v_assessment->>'name', 80)
             or pg_catalog.jsonb_typeof(v_assessment->'weight') <> 'number'
             or pg_catalog.jsonb_typeof(v_assessment->'total') <> 'number' then
            return false;
          end if;
          if (v_assessment->>'weight')::numeric < 0
             or (v_assessment->>'weight')::numeric > 100
             or (v_assessment->>'total')::numeric <= 0
             or (v_assessment->>'total')::numeric > 1000000 then
            return false;
          end if;
        end loop;
      elsif v_course ? 'assessments' then
        return false;
      end if;

      if p_include_topics then
        if pg_catalog.jsonb_typeof(v_course->'topics') <> 'array' then
          return false;
        end if;
        for v_topic in
          select value from pg_catalog.jsonb_array_elements(v_course->'topics')
        loop
          if pg_catalog.jsonb_typeof(v_topic) <> 'object'
             or not (v_topic ? 'title')
             or v_topic - array['title'] <> '{}'::jsonb
             or not private.is_plain_setup_text(v_topic->>'title', 120) then
            return false;
          end if;
        end loop;
      elsif v_course ? 'topics' then
        return false;
      end if;
    end loop;
  end loop;

  return true;
exception
  when others then return false;
end
$$;
