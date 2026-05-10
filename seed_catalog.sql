-- HillCo2 catalog seed
-- 11 phases (7 assessment + 4 placement) and their service_items, modeled
-- on docs/notes/redesign in the hillco-portal repo.
--
-- Run AFTER schema.sql against an empty catalog. Re-running on a non-empty
-- catalog will create duplicates; truncate `service_items` and
-- `catalog_phases` first if you need to re-seed.
--
-- Hour estimates are starting points; tune in the UI as the workflow settles.

DO $$
DECLARE
    v_user_id UUID;
BEGIN
    SELECT id INTO v_user_id FROM users ORDER BY created_at LIMIT 1;
    IF v_user_id IS NOT NULL THEN
        PERFORM set_config('app.user_id', v_user_id::text, true);
    END IF;
END $$;

-- ============================================================
-- Phases
-- ============================================================

INSERT INTO catalog_phases (scope, sort_order, title, description, est_hours, default_billable) VALUES
    -- Assessment (7 phases — the assessment-only engagement covers these)
    ('assessment', 100, 'Client Intake',
     'Initial fact-finding: who the family is, the student''s current school and diagnostic background, and what they''re hoping to achieve.',
     1.0, TRUE),
    ('assessment', 200, 'Parent Interview',
     'Requirement-gathering conversation with caregivers: budget, location, and other constraints that shape the school landscape.',
     1.0, TRUE),
    ('assessment', 300, 'Document Intake',
     'Paperwork and records collection: service agreement, releases, and inbound health/education records.',
     NULL, TRUE),
    ('assessment', 400, 'Document Review',
     'Substantive review of the records: accommodations, services, medical, psychoeducational, and progress data.',
     NULL, TRUE),
    ('assessment', 500, 'Profile Synthesis',
     'Distill records and conversations into a learning profile that drives school matching.',
     NULL, TRUE),
    ('assessment', 600, 'School Research',
     'Map the learning profile to candidate schools and coordinate with school contacts.',
     NULL, TRUE),
    ('assessment', 700, 'Recommendation',
     'Draft, present, and refine the recommendation report.',
     NULL, TRUE),

    -- Placement (4 phases — only run when engagement_type = 'full_placement')
    ('placement', 100, 'Campus Visits',
     'Pre-visit prep, the visit itself, and post-visit debrief.',
     NULL, TRUE),
    ('placement', 200, 'Interview Prep',
     'Get the family ready for school interviews — coaching and mock runs.',
     NULL, TRUE),
    ('placement', 300, 'School Submissions',
     'Application support, packet prep, and admissions decision processing — repeats per school.',
     NULL, TRUE),
    ('placement', 400, 'School Selection',
     'Final decision and transition strategy.',
     NULL, TRUE);

-- ============================================================
-- Service items
-- ============================================================
-- VALUES list joins back to catalog_phases by (scope, phase_title) so
-- the FK is resolved at seed time without hardcoding UUIDs.

INSERT INTO service_items (phase_id, sort_order, title, description, default_est_hours, default_billable, default_deliverable, default_owner_role)
SELECT cp.id,
       items.sort_order,
       items.title,
       items.description,
       items.est_hours,
       items.billable,
       items.deliverable,
       items.owner_role
FROM catalog_phases cp
JOIN (VALUES
    -- Assessment / Client Intake
    ('assessment', 'Client Intake', 110,
     'Names and contact',
     'Capture parent and student names, primary contact info, and family relationships.',
     0.25::numeric(5,2), TRUE, NULL::text, 'consultant'::owner_role),
    ('assessment', 'Client Intake', 120,
     'Current school',
     'Link the student to their current school in the schools table; capture grade level.',
     0.1::numeric(5,2), TRUE, NULL, 'consultant'::owner_role),
    ('assessment', 'Client Intake', 130,
     'Background diagnoses',
     '504 / IEP status and diagnostic flags: learning disability, autism (level 1-3), ADHD/ADD, intellectual disability, health impairment, emotional disturbance, other.',
     0.25::numeric(5,2), TRUE, NULL, 'consultant'::owner_role),
    ('assessment', 'Client Intake', 140,
     'Needs and goals',
     'Free-form: what is the family hoping to achieve through this engagement?',
     0.4::numeric(5,2), TRUE, NULL, 'consultant'::owner_role),

    -- Assessment / Parent Interview
    ('assessment', 'Parent Interview', 210,
     'Requirement constraints',
     'School budget, geographic location, and any other hard constraints. Captured as engagement_requirements rows.',
     1.0::numeric(5,2), TRUE, 'Engagement requirements captured', 'consultant'::owner_role),

    -- Assessment / Document Intake
    ('assessment', 'Document Intake', 310,
     'Service agreement signed',
     'Engagement contract executed; scope, deliverables, and fees confirmed.',
     0.25::numeric(5,2), TRUE, 'Signed service agreement', 'assistant'::owner_role),
    ('assessment', 'Document Intake', 320,
     'Release forms signed',
     'Authorization to obtain school, medical, and provider records.',
     0.25::numeric(5,2), TRUE, 'Signed release forms', 'assistant'::owner_role),
    ('assessment', 'Document Intake', 330,
     'Collect student health and education records',
     'Records request and collection: prior schools, evaluators, medical providers. Organize the client file as records arrive.',
     1.0::numeric(5,2), TRUE, 'Organized client file', 'assistant'::owner_role),

    -- Assessment / Document Review
    ('assessment', 'Document Review', 410,
     'Required accommodations review',
     'Identify accommodations the student requires (testing, classroom, environmental).',
     0.5::numeric(5,2), TRUE, NULL, 'consultant'::owner_role),
    ('assessment', 'Document Review', 420,
     'Required services review',
     'Identify direct services the student needs (speech, OT, counseling, tutoring, etc.).',
     0.5::numeric(5,2), TRUE, NULL, 'consultant'::owner_role),
    ('assessment', 'Document Review', 430,
     'Medical records review',
     'Synthesize medical history relevant to school placement.',
     1.0::numeric(5,2), TRUE, NULL, 'consultant'::owner_role),
    ('assessment', 'Document Review', 440,
     'Psychoeducational / Neuropsych review',
     'Cognitive, achievement, and clinical findings reviewed and synthesized.',
     2.5::numeric(5,2), TRUE, NULL, 'consultant'::owner_role),
    ('assessment', 'Document Review', 450,
     'Report card / progress report review',
     'Academic trajectory and prior school feedback.',
     1.0::numeric(5,2), TRUE, NULL, 'consultant'::owner_role),

    -- Assessment / Profile Synthesis
    ('assessment', 'Profile Synthesis', 510,
     'Build learning profile',
     'Pull intake, interviews, and document review into a structured learning_profiles row: strengths, challenges, accommodations needed, services needed, summary.',
     2.0::numeric(5,2), TRUE, 'Learning profile (finalized)', 'consultant'::owner_role),

    -- Assessment / School Research
    ('assessment', 'School Research', 610,
     'Map learning profile to candidate schools',
     'Identify schools whose program fits the profile and engagement requirements.',
     2.0::numeric(5,2), TRUE, NULL, 'consultant'::owner_role),
    ('assessment', 'School Research', 620,
     'School coordination and confirmation',
     'Outreach to candidate schools to confirm openings, fit, and admissions timing.',
     1.0::numeric(5,2), TRUE, NULL, 'consultant'::owner_role),

    -- Assessment / Recommendation
    ('assessment', 'Recommendation', 710,
     'Recommendation report drafting',
     'Write the recommendation: ranked schools, rationale, and next steps.',
     2.0::numeric(5,2), TRUE, 'Draft recommendation report', 'consultant'::owner_role),
    ('assessment', 'Recommendation', 720,
     'Recommendation meeting with family',
     'Walk the family through the recommendation; capture their reactions and questions.',
     1.0::numeric(5,2), TRUE, NULL, 'consultant'::owner_role),
    ('assessment', 'Recommendation', 730,
     'Follow-up questions and report refinement',
     'Address post-meeting questions and revise the report into its final form.',
     1.0::numeric(5,2), TRUE, 'Final recommendation report', 'consultant'::owner_role),

    -- Placement / Campus Visits
    ('placement', 'Campus Visits', 110,
     'Pre-visit briefing with family',
     'What to look for, what to ask, what to listen for.',
     0.5::numeric(5,2), TRUE, NULL, 'consultant'::owner_role),
    ('placement', 'Campus Visits', 120,
     'School visit',
     'Accompany the family on the campus visit (if requested). Captured as a school_visit row.',
     3.0::numeric(5,2), TRUE, NULL, 'consultant'::owner_role),
    ('placement', 'Campus Visits', 130,
     'Post-visit debrief',
     'Walk through the visit with the family; record opinions and impressions.',
     0.5::numeric(5,2), TRUE, NULL, 'consultant'::owner_role),

    -- Placement / Interview Prep
    ('placement', 'Interview Prep', 210,
     'Parent / student interview prep',
     'Coach the family on what to expect and how to present themselves.',
     1.0::numeric(5,2), TRUE, NULL, 'consultant'::owner_role),
    ('placement', 'Interview Prep', 220,
     'Mock interviews',
     'Practice interview run-throughs with feedback.',
     1.5::numeric(5,2), TRUE, NULL, 'consultant'::owner_role),

    -- Placement / School Submissions (one task set per school)
    ('placement', 'School Submissions', 310,
     'Application support',
     'Help the family complete the application; review essays and forms.',
     1.5::numeric(5,2), TRUE, NULL, 'both'::owner_role),
    ('placement', 'School Submissions', 320,
     'Records packet preparation',
     'Assemble the records packet to send with the application.',
     1.0::numeric(5,2), TRUE, 'Records packet', 'assistant'::owner_role),
    ('placement', 'School Submissions', 330,
     'Acceptance / rejection processing call',
     'Process the admissions decision with the family; plan next steps.',
     0.5::numeric(5,2), TRUE, NULL, 'consultant'::owner_role),

    -- Placement / School Selection
    ('placement', 'School Selection', 410,
     'School transition strategy session',
     'Final decision support and a strategy for transitioning to the chosen school.',
     1.5::numeric(5,2), TRUE, NULL, 'consultant'::owner_role)
) AS items(scope, phase_title, sort_order, title, description, est_hours, billable, deliverable, owner_role)
ON cp.scope = items.scope::catalog_scope AND cp.title = items.phase_title;
