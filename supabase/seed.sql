-- ===================================================================
-- KAUSHAL — demo seed
--
-- The same demo academy as src/lib/dal/seed-data.ts, on the fixed ids
-- from src/lib/constants.ts. This is the Postgres smoke test, not the
-- full cohort: twelve students instead of sixty-two, which is enough to
-- prove the schema, the indexes and the policies hold.
--
-- What it must contain, and does: Aarav Krishnan with six works, his
-- value range flat at 4 across all six while the other four dimensions
-- climb, one unconfirmed work waiting at the end of the run, and the
-- plateau alert that flatness produces.
--
-- Idempotent. Deleting the academy row cascades to every other table,
-- so running this file twice leaves exactly the same rows as running it
-- once. Every id is derived, never random, for the same reason.
--
-- Run after schema.sql and policies.sql. Run it as the SQL editor's
-- default role, which bypasses row level security; the demo academy has
-- no auth user behind it, so no policy would let it in.
-- ===================================================================

delete from public.academies
where id = '00000000-0000-4000-a000-000000000001'::uuid;

insert into public.academies (id, name, owner_id, discipline, calibrated_at, created_at)
values (
  '00000000-0000-4000-a000-000000000001',
  'Krishna Art Academy',
  '00000000-0000-4000-a000-000000000002',
  'drawing',
  now() - interval '150 days',
  now() - interval '210 days'
);

insert into public.instructors (id, academy_id, email, name, created_at)
values (
  '00000000-0000-4000-a000-000000000002',
  '00000000-0000-4000-a000-000000000001',
  'demo@kaushal.app',
  'K. Ramesh',
  now() - interval '210 days'
);

-- -------------------------------------------------------------------
-- Students. Twelve, the featured one first so its id lands on the
-- constant the app looks for: 0x10 is 16, and the ids count from there.
-- -------------------------------------------------------------------

do $$
declare
  v_academy uuid := '00000000-0000-4000-a000-000000000001';
  v_names text[] := array[
    'Aarav Krishnan', 'Divya Raghavan', 'Karthik Subramanian', 'Meera Iyer',
    'Nithya Balan', 'Rohan Menon', 'Sanjana Pillai', 'Vikram Anand',
    'Anjali Nair', 'Praveen Kumar', 'Lakshmi Venkat', 'Arjun Dev'
  ];
  v_levels int[] := array[2, 1, 3, 2, 1, 2, 3, 1, 2, 1, 3, 2];
  v_status text[] := array[
    'active', 'active', 'active', 'active', 'active', 'active',
    'active', 'active', 'active', 'active', 'active', 'paused'
  ];
  i int;
begin
  for i in 1..12 loop
    insert into public.students (id, academy_id, name, joined_at, level, status, created_at)
    values (
      ('00000000-0000-4000-a000-' || lpad(to_hex(15 + i), 12, '0'))::uuid,
      v_academy,
      v_names[i],
      now() - interval '1 day' * (200 - i * 6),
      v_levels[i],
      v_status[i],
      now() - interval '1 day' * (200 - i * 6)
    );
  end loop;
end
$$;

-- -------------------------------------------------------------------
-- The featured student's six works.
--
-- Six sittings over ten weeks. Proportion, line, edges and composition
-- all climb. Value range does not move, and the metrics agree with the
-- scores: darkest 0.28 against lightest 0.70 is a drawing that never
-- reaches paper white or a true black, sitting in a mid-grey band. That
-- agreement is the point — the number is checkable against the pixels.
--
-- The first five works are confirmed by the instructor. The sixth
-- carries proposals only, so the demo opens with something to confirm.
-- -------------------------------------------------------------------

do $$
declare
  v_student uuid := '00000000-0000-4000-a000-000000000010';
  v_dims text[] := array[
    'proportion', 'line_control', 'value_range', 'edge_quality', 'composition'
  ];
  v_scores int[][] := array[
    array[4, 5, 5, 6, 6, 7],  -- proportion
    array[4, 4, 5, 5, 6, 7],  -- line control
    array[4, 4, 4, 4, 5, 4],  -- value range, flat for ten weeks
    array[3, 4, 4, 5, 5, 6],  -- edge quality
    array[5, 5, 6, 6, 7, 7]   -- composition
  ];
  v_rationales text[] := array[
    'Relationships between the head and the shoulders hold across the sheet.',
    'Strokes are committed in the main forms and searching in the detail.',
    'Everything sits in a mid-grey band; no true dark and no clean paper white.',
    'Edges are treated the same way throughout, mostly a hard outline.',
    'Placement uses the sheet, with even margins on three sides.'
  ];
  v_hist jsonb := '[0.00,0.00,0.01,0.02,0.04,0.10,0.18,0.22,0.19,0.12,0.07,0.03,0.02,0.00,0.00,0.00]'::jsonb;
  v_work uuid;
  v_url text;
  v_captured timestamptz;
  i int;
  d int;
begin
  for i in 1..6 loop
    v_work := ('00000000-0000-4001-a000-' || lpad(to_hex(i), 12, '0'))::uuid;
    v_captured := now() - interval '1 day' * (3 + (6 - i) * 14);
    v_url := 'data:image/svg+xml;utf8,'
      || '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1000">'
      || '<rect width="800" height="1000" fill="%23ded8ca"/>'
      || '<rect x="120" y="160" width="560" height="680" fill="%23c9c2b3"/>'
      || '<text x="120" y="920" font-family="Georgia" font-size="44" fill="%233a352f">'
      || 'Study ' || i || '</text></svg>';

    insert into public.works (
      id, student_id, image_url, thumb_url, captured_at,
      assignment_id, notes, is_calibration, metrics, created_at
    )
    values (
      v_work,
      v_student,
      v_url,
      v_url,
      v_captured,
      null,
      case when i = 3 then 'Worked from the cast under window light.' else null end,
      false,
      jsonb_build_object(
        'histogram', v_hist,
        'darkest', 0.28,
        'lightest', 0.70,
        'valueSpread', 0.42,
        'contrastSd', 0.11,
        'inkCoverage', 0.31,
        'edgeDensity', 0.11 + 0.01 * i,
        'edgeVariance', 0.05,
        'borderEnergy', 0.09,
        'massCenter', jsonb_build_object('x', 0.49, 'y', 0.47),
        'emptyShare', 0.34,
        'strokeCoherence', 0.50 + 0.03 * i,
        'width', 1600,
        'height', 1200
      ),
      v_captured
    );

    for d in 1..5 loop
      insert into public.scores (
        id, work_id, dimension, ai_score, ai_rationale, ai_confidence,
        source, confirmed_score, confirmed_by, confirmed_at, created_at
      )
      values (
        ('00000000-0000-4002-a000-' || lpad(to_hex(i * 10 + d), 12, '0'))::uuid,
        v_work,
        v_dims[d]::public.dimension,
        v_scores[d][i],
        v_rationales[d],
        0.78,
        'gemini',
        case when i < 6 then v_scores[d][i] else null end,
        case when i < 6 then '00000000-0000-4000-a000-000000000002'::uuid else null end,
        case when i < 6 then v_captured + interval '2 hours' else null end,
        v_captured
      );
    end loop;
  end loop;
end
$$;

-- -------------------------------------------------------------------
-- The rest of the cohort. Four works each, all confirmed, on rising
-- numbers with different starting points. Student nine stopped forty
-- days ago, which is what the dormant alert below is about.
-- -------------------------------------------------------------------

do $$
declare
  v_dims text[] := array[
    'proportion', 'line_control', 'value_range', 'edge_quality', 'composition'
  ];
  v_recency int[] := array[3, 6, 4, 9, 12, 7, 5, 15, 40, 8, 11, 33];
  v_base int[] := array[4, 3, 5, 4, 2, 4, 6, 3, 5, 4, 6, 3];
  v_hist jsonb := '[0.01,0.02,0.03,0.05,0.07,0.09,0.12,0.14,0.13,0.11,0.09,0.06,0.04,0.02,0.01,0.01]'::jsonb;
  v_student uuid;
  v_work uuid;
  v_url text;
  v_captured timestamptz;
  v_value int;
  s int;
  i int;
  d int;
begin
  for s in 2..12 loop
    v_student := ('00000000-0000-4000-a000-' || lpad(to_hex(15 + s), 12, '0'))::uuid;

    for i in 1..4 loop
      v_work := ('00000000-0000-4001-a000-' || lpad(to_hex(100 + s * 10 + i), 12, '0'))::uuid;
      v_captured := now() - interval '1 day' * (v_recency[s] + (4 - i) * 14);
      v_url := 'data:image/svg+xml;utf8,'
        || '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1000">'
        || '<rect width="800" height="1000" fill="%23ded8ca"/>'
        || '<rect x="140" y="180" width="520" height="640" fill="%23c9c2b3"/>'
        || '<text x="140" y="900" font-family="Georgia" font-size="40" fill="%233a352f">'
        || 'Sitting ' || i || '</text></svg>';

      insert into public.works (
        id, student_id, image_url, thumb_url, captured_at,
        assignment_id, notes, is_calibration, metrics, created_at
      )
      values (
        v_work, v_student, v_url, v_url, v_captured, null, null, false,
        jsonb_build_object(
          'histogram', v_hist,
          'darkest', 0.12,
          'lightest', 0.88,
          'valueSpread', 0.76,
          'contrastSd', 0.22,
          'inkCoverage', 0.29,
          'edgeDensity', 0.14,
          'edgeVariance', 0.09,
          'borderEnergy', 0.07,
          'massCenter', jsonb_build_object('x', 0.51, 'y', 0.48),
          'emptyShare', 0.30,
          'strokeCoherence', 0.58,
          'width', 1600,
          'height', 1200
        ),
        v_captured
      );

      for d in 1..5 loop
        -- Deterministic, and inside 1..10 by construction.
        v_value := least(10, greatest(1, v_base[s] + i - 1 + ((s + d) % 3) - 1));

        insert into public.scores (
          id, work_id, dimension, ai_score, ai_rationale, ai_confidence,
          source, confirmed_score, confirmed_by, confirmed_at, created_at
        )
        values (
          ('00000000-0000-4002-a000-' || lpad(to_hex(1000 + s * 100 + i * 10 + d), 12, '0'))::uuid,
          v_work,
          v_dims[d]::public.dimension,
          v_value,
          'Scored against the academy anchors for this dimension.',
          0.72,
          'gemini',
          v_value,
          '00000000-0000-4000-a000-000000000002'::uuid,
          v_captured + interval '3 hours',
          v_captured
        );
      end loop;
    end loop;
  end loop;
end
$$;

-- -------------------------------------------------------------------
-- The ten calibration anchors.
--
-- Past works the instructor scored by hand during onboarding. They are
-- flagged is_calibration, so every trajectory query skips them, and
-- their numbers live in calibrations rather than scores because they
-- are the academy's standard, not a student's record.
-- -------------------------------------------------------------------

do $$
declare
  v_academy uuid := '00000000-0000-4000-a000-000000000001';
  v_dims text[] := array[
    'proportion', 'line_control', 'value_range', 'edge_quality', 'composition'
  ];
  v_offsets int[] := array[0, 0, -1, 1, 0];
  v_student uuid;
  v_work uuid;
  v_url text;
  v_captured timestamptz;
  k int;
  d int;
begin
  for k in 1..10 loop
    v_student := ('00000000-0000-4000-a000-' || lpad(to_hex(15 + 1 + (k % 12)), 12, '0'))::uuid;
    v_work := ('00000000-0000-4003-a000-' || lpad(to_hex(k), 12, '0'))::uuid;
    v_captured := now() - interval '1 day' * (160 - k * 2);
    v_url := 'data:image/svg+xml;utf8,'
      || '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1000">'
      || '<rect width="800" height="1000" fill="%23e9e4d9"/>'
      || '<rect x="100" y="140" width="600" height="720" fill="%23a89f90"/>'
      || '<text x="100" y="930" font-family="Georgia" font-size="40" fill="%2323201c">'
      || 'Anchor ' || k || '</text></svg>';

    insert into public.works (
      id, student_id, image_url, thumb_url, captured_at,
      assignment_id, notes, is_calibration, metrics, created_at
    )
    values (
      v_work, v_student, v_url, v_url, v_captured, null,
      'Calibration anchor ' || k || ' of 10.', true, null, v_captured
    );

    for d in 1..5 loop
      insert into public.calibrations (
        id, academy_id, work_id, dimension, anchor_score, created_at
      )
      values (
        ('00000000-0000-4004-a000-' || lpad(to_hex(k * 10 + d), 12, '0'))::uuid,
        v_academy,
        v_work,
        v_dims[d]::public.dimension,
        least(10, greatest(1, k + v_offsets[d])),
        v_captured
      );
    end loop;
  end loop;
end
$$;

-- -------------------------------------------------------------------
-- The narrative rows: the assignment written against the flat value
-- range, the alert that flatness raised, the dormant student, and a
-- report waiting for approval.
-- -------------------------------------------------------------------

insert into public.assignments (
  id, student_id, target_dimension, brief, issued_at, completed, created_at
)
values (
  '00000000-0000-4005-a000-000000000001',
  '00000000-0000-4000-a000-000000000010',
  'value_range',
  jsonb_build_object(
    'title', 'Five-value scale, then one sphere',
    'rationale',
      'Aarav has held value range at 4 for ten weeks while proportion moved from 4 to 7. '
      || 'The measured spread on his last six drawings is 0.42 of the full scale, so the darks '
      || 'are the thing to push, not the drawing.',
    'steps', jsonb_build_array(
      'Draw a five-step value strip, 4B to paper white, each step a clean flat tone.',
      'Hold the strip against the darkest area of your last drawing and find the gap.',
      'Draw one sphere under a single lamp, using the full strip from step one.',
      'Push the cast shadow to the darkest step before you touch anything else.'
    ),
    'materials', jsonb_build_array('4B pencil', '2B pencil', 'HB pencil', 'Cartridge paper', 'Kneaded eraser'),
    'duration_minutes', 45,
    'success_criteria', jsonb_build_array(
      'The darkest dark on the sheet matches the 4B step on the strip.',
      'Paper white is left untouched somewhere in the lit area.',
      'At least four distinct values read from across the room.'
    )
  ),
  now() - interval '12 days',
  false,
  now() - interval '12 days'
);

insert into public.alerts (
  id, student_id, dimension, type, message, severity, detected_at, resolved_at
)
values
  (
    '00000000-0000-4006-a000-000000000001',
    '00000000-0000-4000-a000-000000000010',
    'value_range',
    'plateau',
    'Value range has not moved in 10 weeks while the other four dimensions climbed 0.30 points a week.',
    'high',
    now() - interval '9 days',
    null
  ),
  (
    '00000000-0000-4006-a000-000000000002',
    '00000000-0000-4000-a000-000000000018',
    null,
    'dormant',
    'Anjali Nair has not submitted work in 40 days.',
    'medium',
    now() - interval '19 days',
    null
  );

insert into public.reports (
  id, student_id, period_start, period_end, content,
  approved_at, approved_by, created_at
)
values (
  '00000000-0000-4007-a000-000000000001',
  '00000000-0000-4000-a000-000000000010',
  now() - interval '90 days',
  now() - interval '3 days',
  jsonb_build_object(
    'headline', 'Aarav is drawing what he sees; next he has to draw how dark it is',
    'summary',
      'Over the last ten weeks Aarav has taken proportion from 4 to 7 and line control from 4 to 7. '
      || 'Placement is now measured rather than guessed, and his strokes commit where they used to search. '
      || 'Value range has stayed at 4 across all six drawings. Everything sits in a narrow mid-grey band, '
      || 'so the work reads flat from across the room even where the drawing underneath is accurate. '
      || 'The next six weeks are about pressure, not accuracy.',
    'improved', jsonb_build_array(
      jsonb_build_object('dimension', 'proportion', 'note', 'Relationships and placement now hold across the whole sheet.', 'from', 4, 'to', 7),
      jsonb_build_object('dimension', 'line_control', 'note', 'Single decisive strokes have replaced repeated searching lines.', 'from', 4, 'to', 7),
      jsonb_build_object('dimension', 'composition', 'note', 'The sheet is used deliberately, with even margins.', 'from', 5, 'to', 7)
    ),
    'focus', jsonb_build_array(
      jsonb_build_object('dimension', 'value_range', 'note', 'No true dark and no clean paper white in any of the six drawings.', 'from', 4, 'to', 4)
    ),
    'next_steps', jsonb_build_array(
      'Five-step value strip before every drawing for the next month.',
      'One sphere a week under a single lamp, pushed to a full black in the cast shadow.'
    ),
    'first_work_id', '00000000-0000-4001-a000-000000000001',
    'latest_work_id', '00000000-0000-4001-a000-000000000006',
    'works_in_period', 6,
    'deltas', jsonb_build_object(
      'proportion', jsonb_build_object('from', 4, 'to', 7),
      'line_control', jsonb_build_object('from', 4, 'to', 7),
      'value_range', jsonb_build_object('from', 4, 'to', 4),
      'edge_quality', jsonb_build_object('from', 3, 'to', 6),
      'composition', jsonb_build_object('from', 5, 'to', 7)
    )
  ),
  null,
  null,
  now() - interval '2 days'
);
