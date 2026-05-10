Defaulted container "postgres" out of: postgres, bootstrap-controller (init)
--
-- PostgreSQL database dump
--

-- Dumped from database version 16.4 (Debian 16.4-1.pgdg110+2)
-- Dumped by pg_dump version 16.4 (Debian 16.4-1.pgdg110+2)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Data for Name: families; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.families (id, household_name, notes, deleted_at, created_at, updated_at) VALUES ('68d9be47-2a01-4e7d-bc62-ee5f2f1afa48', 'Smith', 'Two students. Considering school change after Emma''s 7th grade year.', NULL, '2026-05-06 23:28:46.376616+00', '2026-05-06 23:28:46.376616+00');
INSERT INTO public.families (id, household_name, notes, deleted_at, created_at, updated_at) VALUES ('e3ce32bb-6717-4ce0-ac2c-9776c7fd1dc4', 'Jones', 'Single mom, urgent timeline.', NULL, '2026-05-06 23:28:46.376616+00', '2026-05-06 23:28:46.376616+00');


--
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.users (id, email, name, role, is_active, last_login_at, created_at, updated_at) VALUES ('93dd30d0-382a-4151-a82a-d0eebd40b44a', 'jtb75.dev@gmail.com', 'jtb75.dev', 'consultant', true, NULL, '2026-05-06 23:28:46.176001+00', '2026-05-06 23:28:46.176001+00');
INSERT INTO public.users (id, email, name, role, is_active, last_login_at, created_at, updated_at) VALUES ('34d95bfb-501d-4970-a9d7-e6848c373c33', 'alice.wong@hillco.example', 'Alice Wong', 'consultant', true, NULL, '2026-05-06 23:28:46.376616+00', '2026-05-06 23:28:46.376616+00');
INSERT INTO public.users (id, email, name, role, is_active, last_login_at, created_at, updated_at) VALUES ('3dd0951f-6169-4e6e-8b11-13981840b184', 'bob.patel@hillco.example', 'Bob Patel', 'assistant', true, NULL, '2026-05-06 23:28:46.376616+00', '2026-05-06 23:28:46.376616+00');
INSERT INTO public.users (id, email, name, role, is_active, last_login_at, created_at, updated_at) VALUES ('b58ed1ec-83da-44df-8b92-014341c659f3', 'joe.buhr@gmail.com', 'Joe Buhr', 'consultant', true, '2026-05-09 10:11:23.657187+00', '2026-05-06 23:28:46.176001+00', '2026-05-09 10:11:23.657187+00');
INSERT INTO public.users (id, email, name, role, is_active, last_login_at, created_at, updated_at) VALUES ('fb6bffbd-9af3-4c58-8c98-30904dcd6ade', 'lcbuhr@gmail.com', 'Laura Buhr', 'consultant', true, '2026-05-09 18:03:53.20653+00', '2026-05-06 23:28:46.176001+00', '2026-05-09 18:03:53.20653+00');


--
-- Data for Name: engagements; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.engagements (id, family_id, status, start_date, target_end_date, package_fee, default_hourly_rate, lead_consultant_id, notes, deleted_at, created_at, updated_at) VALUES ('21523ebd-83bb-430a-b7b2-59b3c091cc64', '68d9be47-2a01-4e7d-bc62-ee5f2f1afa48', 'in_progress', '2026-03-15', '2026-08-30', NULL, 175.00, 'b58ed1ec-83da-44df-8b92-014341c659f3', 'Focused on Emma. Family open to private day school within 30 minutes of home. Budget up to $40K/yr.', NULL, '2026-05-06 23:28:46.376616+00', '2026-05-06 23:28:46.376616+00');
INSERT INTO public.engagements (id, family_id, status, start_date, target_end_date, package_fee, default_hourly_rate, lead_consultant_id, notes, deleted_at, created_at, updated_at) VALUES ('ea5cdb44-1f44-4aa9-ab32-561ae3fdab78', 'e3ce32bb-6717-4ce0-ac2c-9776c7fd1dc4', 'in_progress', '2026-04-20', NULL, NULL, 175.00, '34d95bfb-501d-4970-a9d7-e6848c373c33', NULL, NULL, '2026-05-06 23:28:46.376616+00', '2026-05-06 23:28:46.376616+00');
INSERT INTO public.engagements (id, family_id, status, start_date, target_end_date, package_fee, default_hourly_rate, lead_consultant_id, notes, deleted_at, created_at, updated_at) VALUES ('d8f0af5f-d428-4832-9bc6-550f4fac637b', '68d9be47-2a01-4e7d-bc62-ee5f2f1afa48', 'in_progress', NULL, NULL, NULL, NULL, 'b58ed1ec-83da-44df-8b92-014341c659f3', NULL, NULL, '2026-05-06 23:30:08.664742+00', '2026-05-06 23:30:08.664742+00');


--
-- Data for Name: communications; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: schools; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.schools (id, name, location, school_type, grade_range_low, grade_range_high, website, fit_profile, notes, deleted_at, created_at, updated_at) VALUES ('d46e6624-646a-4b93-8b75-28abdf4f7852', 'Clayton High School', 'Clayton, MO', 'Public', '9', '12', 'https://claytonschools.net', 'Strong academics with good SSD support. Fits students who can self-advocate and benefit from rigorous coursework.', 'Met with Mary C. (Principal) and Jane S. (SSD Coordinator) on 2026-04-30. Receptive to out-of-district placements.', NULL, '2026-05-06 23:28:46.376616+00', '2026-05-06 23:28:46.376616+00');
INSERT INTO public.schools (id, name, location, school_type, grade_range_low, grade_range_high, website, fit_profile, notes, deleted_at, created_at, updated_at) VALUES ('10451cf0-de73-40d0-ac0e-99159677401a', 'Westview Academy', 'St. Louis, MO', 'Private', '6', '12', NULL, 'College prep with light learning support. Good for students with mild executive function challenges.', NULL, NULL, '2026-05-06 23:28:46.376616+00', '2026-05-06 23:28:46.376616+00');
INSERT INTO public.schools (id, name, location, school_type, grade_range_low, grade_range_high, website, fit_profile, notes, deleted_at, created_at, updated_at) VALUES ('1f704900-7d60-4bfe-a7ef-6e6c86c9f318', 'Rohan Woods', 'Warson Woods, MO', 'Private', 'PK', '6', NULL, NULL, 'Rolling Admissions', NULL, '2026-05-07 21:20:45.510677+00', '2026-05-07 21:21:45.472482+00');
INSERT INTO public.schools (id, name, location, school_type, grade_range_low, grade_range_high, website, fit_profile, notes, deleted_at, created_at, updated_at) VALUES ('5bd57683-72b2-4aa1-8d4c-db00b1cf16de', 'The College School', 'Webster Groves, MO', 'Private', 'PK', '8', NULL, NULL, 'Admissions due in January for following school year.', NULL, '2026-05-07 21:24:33.825865+00', '2026-05-07 21:24:33.825865+00');
INSERT INTO public.schools (id, name, location, school_type, grade_range_low, grade_range_high, website, fit_profile, notes, deleted_at, created_at, updated_at) VALUES ('269be9e8-a92f-4f59-bcbb-266a5a050337', 'Community School', 'Ladue, MO', 'Private', 'Preschool', '6', NULL, NULL, 'Admissions due Jan/Feb for following school year.', NULL, '2026-05-07 21:30:16.356944+00', '2026-05-07 21:30:16.356944+00');
INSERT INTO public.schools (id, name, location, school_type, grade_range_low, grade_range_high, website, fit_profile, notes, deleted_at, created_at, updated_at) VALUES ('7d585aab-a88e-434b-a8ab-a1db0c999da7', 'The Fulton School', 'Chesterfield, MO', 'Montessori', '18 mos.', '12', NULL, NULL, NULL, NULL, '2026-05-07 21:40:46.002016+00', '2026-05-07 21:40:46.002016+00');
INSERT INTO public.schools (id, name, location, school_type, grade_range_low, grade_range_high, website, fit_profile, notes, deleted_at, created_at, updated_at) VALUES ('f75aab9a-d16a-4695-ac8a-ba7674f5d23c', 'Churchill', 'Town & Country, MO', 'Private', '2', '6', NULL, NULL, 'Rolling Admissions', NULL, '2026-05-07 21:50:36.864903+00', '2026-05-07 21:50:36.864903+00');
INSERT INTO public.schools (id, name, location, school_type, grade_range_low, grade_range_high, website, fit_profile, notes, deleted_at, created_at, updated_at) VALUES ('2cb5331d-8d85-4812-923c-8d7028ea29aa', 'Forsyth School', 'Clayton, MO', 'Private', 'Preschool', '6', NULL, NULL, 'Admissions open Sept. 1 2026 for 27/28 school year.', NULL, '2026-05-07 21:36:34.358707+00', '2026-05-07 21:51:11.151402+00');
INSERT INTO public.schools (id, name, location, school_type, grade_range_low, grade_range_high, website, fit_profile, notes, deleted_at, created_at, updated_at) VALUES ('525e1b06-4721-472a-a965-6da67ab39b19', 'MICDS', 'Ladue, MO', 'Private', 'JK', '12', NULL, NULL, 'Admissions due Jan/Feb for following school year.  Rolling admissions based on availability.', NULL, '2026-05-07 21:57:02.210487+00', '2026-05-07 21:57:02.210487+00');
INSERT INTO public.schools (id, name, location, school_type, grade_range_low, grade_range_high, website, fit_profile, notes, deleted_at, created_at, updated_at) VALUES ('332be43d-51ee-4b08-be01-9313f2874a34', 'Kirk Day School', 'Creve Coeur, MO', 'Religious / Parochial', 'Preschool', '6', NULL, NULL, 'Admissions due Sept. 2026 for 27/28 school year.  Rolling admissions based on availability.', NULL, '2026-05-07 21:48:04.928244+00', '2026-05-07 21:57:49.830497+00');
INSERT INTO public.schools (id, name, location, school_type, grade_range_low, grade_range_high, website, fit_profile, notes, deleted_at, created_at, updated_at) VALUES ('7dcc90f9-47ff-4a2c-b86d-9b857b8b9a2a', 'Whitfield', 'West St. Louis County', 'Private', '6', '12', NULL, NULL, 'Admission Dates- 9th Grade December, 6-8 & 10-12 January
Rolling admissions based on availability.', NULL, '2026-05-08 00:38:16.742389+00', '2026-05-08 00:38:16.742389+00');
INSERT INTO public.schools (id, name, location, school_type, grade_range_low, grade_range_high, website, fit_profile, notes, deleted_at, created_at, updated_at) VALUES ('73cddad0-ebc6-40f3-8988-5ae0c6847471', 'Rossman', 'Creve Coeur, MO', 'Private', 'PK', '6', NULL, NULL, NULL, NULL, '2026-05-07 21:26:59.405659+00', '2026-05-08 00:38:47.464296+00');
INSERT INTO public.schools (id, name, location, school_type, grade_range_low, grade_range_high, website, fit_profile, notes, deleted_at, created_at, updated_at) VALUES ('9952c7d2-cc38-4de0-931f-32b40ac27c00', 'Westminster', 'Town & Country, MO', 'Religious / Parochial', '7', '12', NULL, NULL, 'Admissions Timeline- Applications open in August. 9th Grade due in December. All other grades due in January. Rolling Admissions after April 1st.', NULL, '2026-05-08 00:45:38.341315+00', '2026-05-08 00:45:38.341315+00');
INSERT INTO public.schools (id, name, location, school_type, grade_range_low, grade_range_high, website, fit_profile, notes, deleted_at, created_at, updated_at) VALUES ('c6a93db6-e80c-478d-9235-1dbf720e8f05', 'Thomas Jefferson School', 'Sunset Hills, MO', 'Private, Boarding', '7', '12', NULL, NULL, 'Rolling Admissions', NULL, '2026-05-08 00:48:16.250397+00', '2026-05-08 00:48:16.250397+00');
INSERT INTO public.schools (id, name, location, school_type, grade_range_low, grade_range_high, website, fit_profile, notes, deleted_at, created_at, updated_at) VALUES ('8c518653-0c39-4270-b5a8-57a084172344', 'LAURA B Day School', 'Webster Groves, MO', 'Private', 'PreK', '8', NULL, NULL, NULL, NULL, '2026-05-06 23:28:46.376616+00', '2026-05-08 00:50:02.107147+00');
INSERT INTO public.schools (id, name, location, school_type, grade_range_low, grade_range_high, website, fit_profile, notes, deleted_at, created_at, updated_at) VALUES ('5a0c09a7-5fdd-4b43-9c74-d250835c9dd0', 'MARY C  Day School', 'Pacific, MO', 'Private', '1', '12', 'https://crossroadsschool.org', 'Small therapeutic environment with 1:6 ratio. Best for students with significant learning differences.', 'Tuition $35K/yr. Met with Jill G. and Sally S. on 2026-05-12.', NULL, '2026-05-06 23:28:46.376616+00', '2026-05-08 00:50:43.196786+00');
INSERT INTO public.schools (id, name, location, school_type, grade_range_low, grade_range_high, website, fit_profile, notes, deleted_at, created_at, updated_at) VALUES ('40c41a1d-7dd2-4268-ab59-0c52da1c1976', 'Promise Academy', 'Town & Country, MO', 'Special Ed./Christian', NULL, NULL, NULL, NULL, NULL, NULL, '2026-05-08 00:56:42.176291+00', '2026-05-08 00:56:42.176291+00');
INSERT INTO public.schools (id, name, location, school_type, grade_range_low, grade_range_high, website, fit_profile, notes, deleted_at, created_at, updated_at) VALUES ('a37079e7-1bba-4f33-886f-472b7975357c', 'St. Mary''s South Side High School', 'St. Louis City', 'Religious / Parochial', '9', '12', NULL, NULL, NULL, NULL, '2026-05-08 01:11:03.467603+00', '2026-05-08 01:11:03.467603+00');
INSERT INTO public.schools (id, name, location, school_type, grade_range_low, grade_range_high, website, fit_profile, notes, deleted_at, created_at, updated_at) VALUES ('323c58ce-169c-49ec-a479-380566f7540d', 'Crossroads College Prep', 'St. Louis City', 'Private', '6', '12', NULL, NULL, NULL, NULL, '2026-05-08 01:16:39.498881+00', '2026-05-08 01:16:39.498881+00');
INSERT INTO public.schools (id, name, location, school_type, grade_range_low, grade_range_high, website, fit_profile, notes, deleted_at, created_at, updated_at) VALUES ('e5c3d988-278d-4b94-8c10-300770a9589f', 'Ursuline Academy', 'Kirkwood, MO', 'Religious / Parochial', '9', '12', NULL, NULL, NULL, NULL, '2026-05-08 18:19:24.670376+00', '2026-05-08 18:19:24.670376+00');
INSERT INTO public.schools (id, name, location, school_type, grade_range_low, grade_range_high, website, fit_profile, notes, deleted_at, created_at, updated_at) VALUES ('5448a856-9449-4d93-9944-266b19fa0cad', 'St. Joseph''s Academy', 'Frontenac, MO', 'Religious / Parochial', '9', '12', NULL, NULL, NULL, NULL, '2026-05-08 18:21:07.118773+00', '2026-05-08 18:21:07.118773+00');
INSERT INTO public.schools (id, name, location, school_type, grade_range_low, grade_range_high, website, fit_profile, notes, deleted_at, created_at, updated_at) VALUES ('bbbe491b-eb5f-4493-b7f9-3cde3a1f7ada', 'Visitation Academy', 'Town & Country, MO', 'Religious / Parochial', '1', '12', NULL, NULL, NULL, NULL, '2026-05-08 18:23:45.090664+00', '2026-05-08 18:23:45.090664+00');
INSERT INTO public.schools (id, name, location, school_type, grade_range_low, grade_range_high, website, fit_profile, notes, deleted_at, created_at, updated_at) VALUES ('a141f26e-4cdf-4d58-9392-dcbd195790d8', 'EYC Academy', 'Chesterfield, MO', 'Private/Alternative', '6', '12', NULL, NULL, NULL, NULL, '2026-05-08 18:26:01.800097+00', '2026-05-08 18:26:01.800097+00');
INSERT INTO public.schools (id, name, location, school_type, grade_range_low, grade_range_high, website, fit_profile, notes, deleted_at, created_at, updated_at) VALUES ('f37f00cc-7ce9-4ac8-8e16-704fcb69fcbe', 'Logos School', 'Olivette, MO', 'Private/Therapeutic', '6', '12', NULL, NULL, NULL, NULL, '2026-05-08 18:28:59.421571+00', '2026-05-08 18:28:59.421571+00');
INSERT INTO public.schools (id, name, location, school_type, grade_range_low, grade_range_high, website, fit_profile, notes, deleted_at, created_at, updated_at) VALUES ('3ed2bd05-8f4b-4ecc-9a9e-f7d17addca18', 'The Wilson School', 'Clayton, MO', 'Private', 'K', '6', NULL, NULL, NULL, NULL, '2026-05-08 18:30:46.827765+00', '2026-05-08 18:30:46.827765+00');
INSERT INTO public.schools (id, name, location, school_type, grade_range_low, grade_range_high, website, fit_profile, notes, deleted_at, created_at, updated_at) VALUES ('77ab57e5-621c-4216-a27b-6d544858a68e', 'Webster Groves High School', 'Webster Groves, MO', 'Public', '9', '12', NULL, NULL, NULL, NULL, '2026-05-08 18:32:04.057681+00', '2026-05-08 18:32:04.057681+00');
INSERT INTO public.schools (id, name, location, school_type, grade_range_low, grade_range_high, website, fit_profile, notes, deleted_at, created_at, updated_at) VALUES ('27e3ef18-a568-4929-9f67-bbed619ae56f', 'Kirkwood High School', 'Kirkwood, MO', 'Public', '9', '12', NULL, NULL, NULL, NULL, '2026-05-08 18:32:40.964011+00', '2026-05-08 18:32:40.964011+00');
INSERT INTO public.schools (id, name, location, school_type, grade_range_low, grade_range_high, website, fit_profile, notes, deleted_at, created_at, updated_at) VALUES ('bf4c8e6d-1888-4b81-a393-894c4380e8b0', 'Maplewood/Richmond Heights High School', 'Maplewood, MO', 'Public', '9', '12', NULL, NULL, NULL, NULL, '2026-05-08 18:37:44.033955+00', '2026-05-08 18:37:44.033955+00');
INSERT INTO public.schools (id, name, location, school_type, grade_range_low, grade_range_high, website, fit_profile, notes, deleted_at, created_at, updated_at) VALUES ('0777222b-ddf2-4e10-922c-486fac806d2a', 'Nerinx Hall', 'Webster Groves, MO', 'Religious / Parochial', '9', '12', NULL, NULL, NULL, NULL, '2026-05-08 18:17:12.883323+00', '2026-05-08 18:38:16.700115+00');
INSERT INTO public.schools (id, name, location, school_type, grade_range_low, grade_range_high, website, fit_profile, notes, deleted_at, created_at, updated_at) VALUES ('293b6284-3254-49bd-b6e9-7c66266d699c', 'Brentwood High School', 'Brentwood, MO', 'Public', '9', '12', NULL, NULL, NULL, NULL, '2026-05-08 18:39:26.027873+00', '2026-05-08 18:39:26.027873+00');
INSERT INTO public.schools (id, name, location, school_type, grade_range_low, grade_range_high, website, fit_profile, notes, deleted_at, created_at, updated_at) VALUES ('18281768-684e-4c14-9840-247cc448f347', 'DeSmet', 'Creve Coeur, MO', 'Religious / Parochial', '6', '12', NULL, NULL, 'Tuition 6-8 $15,740 9-12 $22,940  762 Students 10:1 Student/Teacher Ratio', NULL, '2026-05-08 01:06:50.515288+00', '2026-05-08 18:57:30.595242+00');
INSERT INTO public.schools (id, name, location, school_type, grade_range_low, grade_range_high, website, fit_profile, notes, deleted_at, created_at, updated_at) VALUES ('5050107b-f345-4c87-9cf0-2cf512e83ba7', 'Chaminade College Prep', 'Frontenac, MO', 'Religious / Parochial', '6', '12', NULL, NULL, 'Tuition $26,520 9:1 Student/Teacher Ratio', NULL, '2026-05-08 01:02:58.837182+00', '2026-05-08 18:50:22.699534+00');
INSERT INTO public.schools (id, name, location, school_type, grade_range_low, grade_range_high, website, fit_profile, notes, deleted_at, created_at, updated_at) VALUES ('be9e3d6b-a77d-4ac6-9190-4f9d9d66ecaf', 'CBC High School', 'West St. Louis County', 'Religious / Parochial', '9', '12', NULL, NULL, 'Tuition $21,500, 860 students, Av. class size 19, 10:1 Student/Teacher Ratio', NULL, '2026-05-08 01:05:20.663863+00', '2026-05-08 18:51:07.02615+00');
INSERT INTO public.schools (id, name, location, school_type, grade_range_low, grade_range_high, website, fit_profile, notes, deleted_at, created_at, updated_at) VALUES ('c7757643-e8ff-4460-b620-ffee9a41baf0', 'SLUH', 'St. Louis City', 'Religious / Parochial', '9', '12', NULL, NULL, 'Tuition $26,000  1,000 Students 19.5 Av class size 19:1 Student/Teacher Ratio', NULL, '2026-05-08 01:08:19.281186+00', '2026-05-08 19:00:48.498769+00');


--
-- Data for Name: contacts; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: documents; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: students; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.students (id, family_id, name, dob, current_school, current_grade, has_504, has_iep, has_learning_disability, has_autism, has_adhd, has_intellectual_disability, has_health_impairment, has_emotional_disturbance, diagnosis_other, needs_goals, deleted_at, created_at, updated_at) VALUES ('6c1737f4-197a-44af-8258-885275841309', '68d9be47-2a01-4e7d-bc62-ee5f2f1afa48', 'Emma Smith', '2013-06-14', 'Lindbergh Middle', '7th', false, true, false, false, true, false, false, false, NULL, 'Strong reader, struggles with executive function and homework completion. Needs structured support and clear deadlines.', NULL, '2026-05-06 23:28:46.376616+00', '2026-05-06 23:28:46.376616+00');
INSERT INTO public.students (id, family_id, name, dob, current_school, current_grade, has_504, has_iep, has_learning_disability, has_autism, has_adhd, has_intellectual_disability, has_health_impairment, has_emotional_disturbance, diagnosis_other, needs_goals, deleted_at, created_at, updated_at) VALUES ('1b089e13-7999-4d06-9032-7997c48a2fb2', '68d9be47-2a01-4e7d-bc62-ee5f2f1afa48', 'Ethan Smith', '2016-03-22', 'Lindbergh Elementary', '4th', true, false, false, false, false, false, false, false, NULL, NULL, NULL, '2026-05-06 23:28:46.376616+00', '2026-05-06 23:28:46.376616+00');
INSERT INTO public.students (id, family_id, name, dob, current_school, current_grade, has_504, has_iep, has_learning_disability, has_autism, has_adhd, has_intellectual_disability, has_health_impairment, has_emotional_disturbance, diagnosis_other, needs_goals, deleted_at, created_at, updated_at) VALUES ('47836a34-8bc4-4040-aa56-44e6f9b3a11d', 'e3ce32bb-6717-4ce0-ac2c-9776c7fd1dc4', 'Oliver Jones', '2014-09-08', 'Brentwood Middle', '6th', false, true, true, false, true, false, false, false, NULL, 'Recently diagnosed with dyslexia. Reading 2 grade levels behind. Anxiety around school.', NULL, '2026-05-06 23:28:46.376616+00', '2026-05-06 23:28:46.376616+00');


--
-- Data for Name: engagement_students; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.engagement_students (engagement_id, student_id) VALUES ('21523ebd-83bb-430a-b7b2-59b3c091cc64', '6c1737f4-197a-44af-8258-885275841309');
INSERT INTO public.engagement_students (engagement_id, student_id) VALUES ('ea5cdb44-1f44-4aa9-ab32-561ae3fdab78', '47836a34-8bc4-4040-aa56-44e6f9b3a11d');
INSERT INTO public.engagement_students (engagement_id, student_id) VALUES ('d8f0af5f-d428-4832-9bc6-550f4fac637b', '6c1737f4-197a-44af-8258-885275841309');


--
-- Data for Name: invoices; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.invoices (id, invoice_number, engagement_id, status, issue_date, due_date, sent_at, subtotal, tax, total, paid_date, paid_amount, notes, pdf_s3_key, deleted_at, created_by, created_at, updated_at) VALUES ('7657fffb-accf-401a-982f-e13b55edde9d', 'HC-2026-0001', '21523ebd-83bb-430a-b7b2-59b3c091cc64', 'paid', '2026-04-05', '2026-05-05', '2026-04-05 15:00:00+00', 437.50, 0.00, 437.50, '2026-04-22', 437.50, NULL, NULL, NULL, 'b58ed1ec-83da-44df-8b92-014341c659f3', '2026-05-06 23:28:46.376616+00', '2026-05-06 23:28:46.376616+00');
INSERT INTO public.invoices (id, invoice_number, engagement_id, status, issue_date, due_date, sent_at, subtotal, tax, total, paid_date, paid_amount, notes, pdf_s3_key, deleted_at, created_by, created_at, updated_at) VALUES ('8480f32d-ceae-4a6f-9623-206a91c662cc', 'HC-2026-0002', '21523ebd-83bb-430a-b7b2-59b3c091cc64', 'sent', '2026-05-01', '2026-05-31', '2026-05-01 14:00:00+00', 1793.50, 0.00, 1793.50, NULL, NULL, NULL, NULL, NULL, 'b58ed1ec-83da-44df-8b92-014341c659f3', '2026-05-06 23:28:46.376616+00', '2026-05-06 23:28:46.376616+00');


--
-- Data for Name: expenses; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.expenses (id, engagement_id, user_id, expense_date, amount, category, description, billable, receipt_doc_id, invoice_id, created_at, updated_at) VALUES ('d44d3dcb-fc3c-4f90-9051-3fd903e25e09', '21523ebd-83bb-430a-b7b2-59b3c091cc64', 'b58ed1ec-83da-44df-8b92-014341c659f3', '2026-05-12', 35.00, 'Mileage', 'Round trip to Crossroads', true, NULL, NULL, '2026-05-06 23:28:46.376616+00', '2026-05-06 23:28:46.376616+00');
INSERT INTO public.expenses (id, engagement_id, user_id, expense_date, amount, category, description, billable, receipt_doc_id, invoice_id, created_at, updated_at) VALUES ('c5572c63-ff1e-4e65-be24-f4a754005c56', '21523ebd-83bb-430a-b7b2-59b3c091cc64', 'b58ed1ec-83da-44df-8b92-014341c659f3', '2026-04-30', 28.50, 'Mileage', 'Round trip to Clayton HS', true, NULL, '8480f32d-ceae-4a6f-9623-206a91c662cc', '2026-05-06 23:28:46.376616+00', '2026-05-06 23:28:46.376616+00');
INSERT INTO public.expenses (id, engagement_id, user_id, expense_date, amount, category, description, billable, receipt_doc_id, invoice_id, created_at, updated_at) VALUES ('e5c1917c-5b03-4100-b79d-d3ed52aa7bad', '21523ebd-83bb-430a-b7b2-59b3c091cc64', '3dd0951f-6169-4e6e-8b11-13981840b184', '2026-04-08', 15.00, 'Application fee', 'Records request fee from Lindbergh', true, NULL, '8480f32d-ceae-4a6f-9623-206a91c662cc', '2026-05-06 23:28:46.376616+00', '2026-05-06 23:28:46.376616+00');


--
-- Data for Name: followups; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.followups (id, engagement_id, title, body, due_date, assignee_id, status, completed_at, created_by, created_at, updated_at) VALUES ('0157c769-1592-4d0a-bb17-ebb35fbc26c4', '21523ebd-83bb-430a-b7b2-59b3c091cc64', 'Send recommendation report draft', 'Top 3 schools with rationale and next steps.', '2026-05-08', 'b58ed1ec-83da-44df-8b92-014341c659f3', 'open', NULL, 'b58ed1ec-83da-44df-8b92-014341c659f3', '2026-05-06 23:28:46.376616+00', '2026-05-06 23:28:46.376616+00');
INSERT INTO public.followups (id, engagement_id, title, body, due_date, assignee_id, status, completed_at, created_by, created_at, updated_at) VALUES ('970cb48b-8166-43e4-a5d4-802ad20439f5', '21523ebd-83bb-430a-b7b2-59b3c091cc64', 'Coordinate Crossroads visit with family', 'Family available afternoons after 4/15.', '2026-04-25', 'b58ed1ec-83da-44df-8b92-014341c659f3', 'done', '2026-04-22 19:00:00+00', 'b58ed1ec-83da-44df-8b92-014341c659f3', '2026-05-06 23:28:46.376616+00', '2026-05-06 23:28:46.376616+00');
INSERT INTO public.followups (id, engagement_id, title, body, due_date, assignee_id, status, completed_at, created_by, created_at, updated_at) VALUES ('cadac782-896d-4e73-a0bb-5f474a96f58e', '21523ebd-83bb-430a-b7b2-59b3c091cc64', 'Pull Emma''s last 2 IEPs', 'Need from Lindbergh.', '2026-04-10', '3dd0951f-6169-4e6e-8b11-13981840b184', 'done', '2026-04-08 15:00:00+00', 'b58ed1ec-83da-44df-8b92-014341c659f3', '2026-05-06 23:28:46.376616+00', '2026-05-06 23:28:46.376616+00');
INSERT INTO public.followups (id, engagement_id, title, body, due_date, assignee_id, status, completed_at, created_by, created_at, updated_at) VALUES ('2c4b2471-8125-4b71-b5b2-04d5467ad395', '21523ebd-83bb-430a-b7b2-59b3c091cc64', 'Application deadline reminder for Westview', 'Apps due May 15.', '2026-05-10', 'b58ed1ec-83da-44df-8b92-014341c659f3', 'open', NULL, 'b58ed1ec-83da-44df-8b92-014341c659f3', '2026-05-06 23:28:46.376616+00', '2026-05-06 23:28:46.376616+00');
INSERT INTO public.followups (id, engagement_id, title, body, due_date, assignee_id, status, completed_at, created_by, created_at, updated_at) VALUES ('c274d63e-988b-43c7-92dd-c97a73c3ebd1', 'ea5cdb44-1f44-4aa9-ab32-561ae3fdab78', 'Schedule student interview with Oliver', NULL, '2026-05-06', '34d95bfb-501d-4970-a9d7-e6848c373c33', 'open', NULL, '34d95bfb-501d-4970-a9d7-e6848c373c33', '2026-05-06 23:28:46.376616+00', '2026-05-06 23:28:46.376616+00');
INSERT INTO public.followups (id, engagement_id, title, body, due_date, assignee_id, status, completed_at, created_by, created_at, updated_at) VALUES ('a9098b13-6bf2-486b-8c44-081ea7c8ef97', 'ea5cdb44-1f44-4aa9-ab32-561ae3fdab78', 'Request psychoed eval from Brentwood', NULL, '2026-04-30', '3dd0951f-6169-4e6e-8b11-13981840b184', 'open', NULL, '34d95bfb-501d-4970-a9d7-e6848c373c33', '2026-05-06 23:28:46.376616+00', '2026-05-06 23:28:46.376616+00');


--
-- Data for Name: invoice_line_items; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.invoice_line_items (id, invoice_id, sort_order, description, quantity, unit_price, line_total, source_type, source_id, created_at, updated_at) VALUES ('138589d0-1de0-42c2-9e72-ac0586986a2f', '7657fffb-accf-401a-982f-e13b55edde9d', 0, 'Time 2026-03-18 — Parent intake interview', 1.50, 175.00, 262.50, 'time', 'a3440b8f-f773-4f3e-be8b-7254304d182b', '2026-05-06 23:28:46.376616+00', '2026-05-06 23:28:46.376616+00');
INSERT INTO public.invoice_line_items (id, invoice_id, sort_order, description, quantity, unit_price, line_total, source_type, source_id, created_at, updated_at) VALUES ('fd34ccef-4187-454c-aae9-45cc6c294a06', '7657fffb-accf-401a-982f-e13b55edde9d', 1, 'Time 2026-03-22 — Student interview with Emma', 1.00, 175.00, 175.00, 'time', 'ea86e7fc-08ef-485c-812d-cb820cc65ebc', '2026-05-06 23:28:46.376616+00', '2026-05-06 23:28:46.376616+00');
INSERT INTO public.invoice_line_items (id, invoice_id, sort_order, description, quantity, unit_price, line_total, source_type, source_id, created_at, updated_at) VALUES ('cae8d7d3-0f46-4718-8f3d-2becfbe99014', '8480f32d-ceae-4a6f-9623-206a91c662cc', 0, 'Time 2026-04-02 — Reviewed psychoed eval, IEPs, report cards', 2.50, 175.00, 437.50, 'time', 'e5f46c82-cce8-4035-88e9-cef8c0910893', '2026-05-06 23:28:46.376616+00', '2026-05-06 23:28:46.376616+00');
INSERT INTO public.invoice_line_items (id, invoice_id, sort_order, description, quantity, unit_price, line_total, source_type, source_id, created_at, updated_at) VALUES ('a1c2fd58-aad4-4417-b684-000634e3d4e3', '8480f32d-ceae-4a6f-9623-206a91c662cc', 1, 'Time 2026-04-15 — School research and matching', 3.00, 175.00, 525.00, 'time', '1193c671-2481-4cbe-9bb7-c1c61c6e9936', '2026-05-06 23:28:46.376616+00', '2026-05-06 23:28:46.376616+00');
INSERT INTO public.invoice_line_items (id, invoice_id, sort_order, description, quantity, unit_price, line_total, source_type, source_id, created_at, updated_at) VALUES ('0a446c9b-c88f-4e78-8336-faff5ac1da5c', '8480f32d-ceae-4a6f-9623-206a91c662cc', 2, 'Time 2026-04-30 — Clayton HS campus visit + write-up', 4.50, 175.00, 787.50, 'time', 'b2555eef-9878-4940-a9c2-f4f51776f910', '2026-05-06 23:28:46.376616+00', '2026-05-06 23:28:46.376616+00');
INSERT INTO public.invoice_line_items (id, invoice_id, sort_order, description, quantity, unit_price, line_total, source_type, source_id, created_at, updated_at) VALUES ('e71736b1-73d9-4c8d-99d0-8113e2677fa6', '8480f32d-ceae-4a6f-9623-206a91c662cc', 3, 'Expense 2026-04-30 — Mileage — Round trip to Clayton HS', 1.00, 28.50, 28.50, 'expense', 'c5572c63-ff1e-4e65-be24-f4a754005c56', '2026-05-06 23:28:46.376616+00', '2026-05-06 23:28:46.376616+00');
INSERT INTO public.invoice_line_items (id, invoice_id, sort_order, description, quantity, unit_price, line_total, source_type, source_id, created_at, updated_at) VALUES ('8bc0e985-9a9b-495b-9d03-8018a7de807a', '8480f32d-ceae-4a6f-9623-206a91c662cc', 4, 'Expense 2026-04-08 — Application fee — Records request fee from Lindbergh', 1.00, 15.00, 15.00, 'expense', 'e5c1917c-5b03-4100-b79d-d3ed52aa7bad', '2026-05-06 23:28:46.376616+00', '2026-05-06 23:28:46.376616+00');


--
-- Data for Name: notes; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.notes (id, engagement_id, kind, occurred_on, title, body, created_by, created_at, updated_at) VALUES ('68580537-15ba-4e95-a607-fbbdaa2aa22e', '21523ebd-83bb-430a-b7b2-59b3c091cc64', 'parent_intake', '2026-03-18', 'Initial parent intake call', 'Met with Dan and Sarah for 90 min. They want a school that gets ADHD/EF support right. Previous tutor wasn''t enough. Open to therapeutic if needed but prefer mainstream with strong support.', 'b58ed1ec-83da-44df-8b92-014341c659f3', '2026-05-06 23:28:46.376616+00', '2026-05-06 23:28:46.376616+00');
INSERT INTO public.notes (id, engagement_id, kind, occurred_on, title, body, created_by, created_at, updated_at) VALUES ('714393c8-7994-4ad0-8138-b432159816f1', '21523ebd-83bb-430a-b7b2-59b3c091cc64', 'student_interview', '2026-03-22', 'Emma student interview', 'Sweet kid, very social, hates being pulled out for resource room. Dreams of being a marine biologist. Likes hands-on learning, struggles with written output and time management.', 'b58ed1ec-83da-44df-8b92-014341c659f3', '2026-05-06 23:28:46.376616+00', '2026-05-06 23:28:46.376616+00');
INSERT INTO public.notes (id, engagement_id, kind, occurred_on, title, body, created_by, created_at, updated_at) VALUES ('4cad607f-20a3-45f8-985e-f06093363933', '21523ebd-83bb-430a-b7b2-59b3c091cc64', 'call', '2026-05-01', 'Follow-up call with Dan', 'Dan asked about Crossroads tuition. Confirmed scholarship pathway exists. Will discuss with Sarah this weekend.', 'b58ed1ec-83da-44df-8b92-014341c659f3', '2026-05-06 23:28:46.376616+00', '2026-05-06 23:28:46.376616+00');
INSERT INTO public.notes (id, engagement_id, kind, occurred_on, title, body, created_by, created_at, updated_at) VALUES ('58f02df8-12f2-4466-8a1b-7277dd6b4ac4', 'ea5cdb44-1f44-4aa9-ab32-561ae3fdab78', 'parent_intake', '2026-04-22', 'Initial intake — Maria', 'Single mom, very stressed. Oliver pulling away from school. Need to figure out if this is dyslexia accommodations being inadequate or wrong placement entirely.', '34d95bfb-501d-4970-a9d7-e6848c373c33', '2026-05-06 23:28:46.376616+00', '2026-05-06 23:28:46.376616+00');


--
-- Data for Name: parents; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.parents (id, family_id, name, email, phone, role, is_primary_contact, created_at, updated_at) VALUES ('ab7e3a8b-a90d-45a8-b4c4-a3dfaa6a3f50', '68d9be47-2a01-4e7d-bc62-ee5f2f1afa48', 'Daniel Smith', 'dan.smith@example.com', '(314) 555-0101', 'dad', true, '2026-05-06 23:28:46.376616+00', '2026-05-06 23:28:46.376616+00');
INSERT INTO public.parents (id, family_id, name, email, phone, role, is_primary_contact, created_at, updated_at) VALUES ('2d5223c5-997b-4683-8be2-74e47b656c2a', '68d9be47-2a01-4e7d-bc62-ee5f2f1afa48', 'Sarah Smith', 'sarah.smith@example.com', '(314) 555-0102', 'mom', false, '2026-05-06 23:28:46.376616+00', '2026-05-06 23:28:46.376616+00');
INSERT INTO public.parents (id, family_id, name, email, phone, role, is_primary_contact, created_at, updated_at) VALUES ('677815a9-0e0f-4284-8381-e4f2cbade204', 'e3ce32bb-6717-4ce0-ac2c-9776c7fd1dc4', 'Maria Jones', 'maria.jones@example.com', '(314) 555-0203', 'mom', true, '2026-05-06 23:28:46.376616+00', '2026-05-06 23:28:46.376616+00');


--
-- Data for Name: reports; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: school_recommendations; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.school_recommendations (id, engagement_id, school_id, rank, status, notes, created_at, updated_at) VALUES ('71220f3b-884b-446d-bf47-e9b1632566e7', '21523ebd-83bb-430a-b7b2-59b3c091cc64', '5a0c09a7-5fdd-4b43-9c74-d250835c9dd0', 1, 'recommended', 'Top choice. Best fit for Emma''s EF needs and social style.', '2026-05-06 23:28:46.376616+00', '2026-05-06 23:28:46.376616+00');
INSERT INTO public.school_recommendations (id, engagement_id, school_id, rank, status, notes, created_at, updated_at) VALUES ('7c2afda4-0f41-4ec6-b351-45d032fe3262', '21523ebd-83bb-430a-b7b2-59b3c091cc64', '10451cf0-de73-40d0-ac0e-99159677401a', 2, 'considered', 'Backup if Crossroads tuition not workable. Less specialized.', '2026-05-06 23:28:46.376616+00', '2026-05-06 23:28:46.376616+00');
INSERT INTO public.school_recommendations (id, engagement_id, school_id, rank, status, notes, created_at, updated_at) VALUES ('21ef5192-becc-4418-b8da-13c6fe7314b2', '21523ebd-83bb-430a-b7b2-59b3c091cc64', 'd46e6624-646a-4b93-8b75-28abdf4f7852', 3, 'rejected', 'Class sizes too large for Emma''s needs.', '2026-05-06 23:28:46.376616+00', '2026-05-06 23:28:46.376616+00');


--
-- Data for Name: school_visits; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.school_visits (id, engagement_id, school_id, visit_date, attendees, facts_notes, opinion_notes, scorecard, hours, created_by, created_at, updated_at) VALUES ('dfbee670-607d-4bb3-8723-8f610452862d', '21523ebd-83bb-430a-b7b2-59b3c091cc64', 'd46e6624-646a-4b93-8b75-28abdf4f7852', '2026-04-30', 'Mary C. (Principal), Jane S. (SSD Coordinator)', 'Class sizes ~24. Resource room available. SSD coordinator on staff. Out-of-district tuition negotiable.', 'Strong academics but Emma might get lost in larger classes. SSD support exists but not as integrated as I''d want. Worth keeping as a backup option.', NULL, 4.50, 'b58ed1ec-83da-44df-8b92-014341c659f3', '2026-05-06 23:28:46.376616+00', '2026-05-06 23:28:46.376616+00');
INSERT INTO public.school_visits (id, engagement_id, school_id, visit_date, attendees, facts_notes, opinion_notes, scorecard, hours, created_by, created_at, updated_at) VALUES ('e4c6e4e4-7085-4fea-be52-67f1ff65d1c9', '21523ebd-83bb-430a-b7b2-59b3c091cc64', '5a0c09a7-5fdd-4b43-9c74-d250835c9dd0', '2026-05-12', 'Jill G. (Principal), Sally S. (Learning Specialist)', 'Small classes (max 8). Therapeutic model with 1:6 student-teacher. Focus on EF skills. Tuition $35K + financial aid available.', 'Excellent fit for Emma. Sally would be her primary advocate. Recommended as top choice.', NULL, 2.00, 'b58ed1ec-83da-44df-8b92-014341c659f3', '2026-05-06 23:28:46.376616+00', '2026-05-06 23:28:46.376616+00');


--
-- Data for Name: school_visit_attendees; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: time_entries; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.time_entries (id, engagement_id, user_id, work_date, hours, description, billable, hourly_rate, invoice_id, created_at, updated_at) VALUES ('c17b7a81-8f0a-4121-9fcf-11a6e5c53762', '21523ebd-83bb-430a-b7b2-59b3c091cc64', '3dd0951f-6169-4e6e-8b11-13981840b184', '2026-03-25', 0.50, 'Records request to Lindbergh', false, NULL, NULL, '2026-05-06 23:28:46.376616+00', '2026-05-06 23:28:46.376616+00');
INSERT INTO public.time_entries (id, engagement_id, user_id, work_date, hours, description, billable, hourly_rate, invoice_id, created_at, updated_at) VALUES ('373f9159-a415-4394-bd79-1c576af642ff', '21523ebd-83bb-430a-b7b2-59b3c091cc64', 'b58ed1ec-83da-44df-8b92-014341c659f3', '2026-05-12', 2.00, 'Crossroads campus visit', true, NULL, NULL, '2026-05-06 23:28:46.376616+00', '2026-05-06 23:28:46.376616+00');
INSERT INTO public.time_entries (id, engagement_id, user_id, work_date, hours, description, billable, hourly_rate, invoice_id, created_at, updated_at) VALUES ('a3440b8f-f773-4f3e-be8b-7254304d182b', '21523ebd-83bb-430a-b7b2-59b3c091cc64', 'b58ed1ec-83da-44df-8b92-014341c659f3', '2026-03-18', 1.50, 'Parent intake interview', true, NULL, '7657fffb-accf-401a-982f-e13b55edde9d', '2026-05-06 23:28:46.376616+00', '2026-05-06 23:28:46.376616+00');
INSERT INTO public.time_entries (id, engagement_id, user_id, work_date, hours, description, billable, hourly_rate, invoice_id, created_at, updated_at) VALUES ('ea86e7fc-08ef-485c-812d-cb820cc65ebc', '21523ebd-83bb-430a-b7b2-59b3c091cc64', 'b58ed1ec-83da-44df-8b92-014341c659f3', '2026-03-22', 1.00, 'Student interview with Emma', true, NULL, '7657fffb-accf-401a-982f-e13b55edde9d', '2026-05-06 23:28:46.376616+00', '2026-05-06 23:28:46.376616+00');
INSERT INTO public.time_entries (id, engagement_id, user_id, work_date, hours, description, billable, hourly_rate, invoice_id, created_at, updated_at) VALUES ('e5f46c82-cce8-4035-88e9-cef8c0910893', '21523ebd-83bb-430a-b7b2-59b3c091cc64', 'b58ed1ec-83da-44df-8b92-014341c659f3', '2026-04-02', 2.50, 'Reviewed psychoed eval, IEPs, report cards', true, NULL, '8480f32d-ceae-4a6f-9623-206a91c662cc', '2026-05-06 23:28:46.376616+00', '2026-05-06 23:28:46.376616+00');
INSERT INTO public.time_entries (id, engagement_id, user_id, work_date, hours, description, billable, hourly_rate, invoice_id, created_at, updated_at) VALUES ('1193c671-2481-4cbe-9bb7-c1c61c6e9936', '21523ebd-83bb-430a-b7b2-59b3c091cc64', 'b58ed1ec-83da-44df-8b92-014341c659f3', '2026-04-15', 3.00, 'School research and matching', true, NULL, '8480f32d-ceae-4a6f-9623-206a91c662cc', '2026-05-06 23:28:46.376616+00', '2026-05-06 23:28:46.376616+00');
INSERT INTO public.time_entries (id, engagement_id, user_id, work_date, hours, description, billable, hourly_rate, invoice_id, created_at, updated_at) VALUES ('b2555eef-9878-4940-a9c2-f4f51776f910', '21523ebd-83bb-430a-b7b2-59b3c091cc64', 'b58ed1ec-83da-44df-8b92-014341c659f3', '2026-04-30', 4.50, 'Clayton HS campus visit + write-up', true, NULL, '8480f32d-ceae-4a6f-9623-206a91c662cc', '2026-05-06 23:28:46.376616+00', '2026-05-06 23:28:46.376616+00');
INSERT INTO public.time_entries (id, engagement_id, user_id, work_date, hours, description, billable, hourly_rate, invoice_id, created_at, updated_at) VALUES ('784bd332-7ac1-4d8f-94aa-6fbeba5661d9', 'ea5cdb44-1f44-4aa9-ab32-561ae3fdab78', '34d95bfb-501d-4970-a9d7-e6848c373c33', '2026-04-22', 2.00, 'Parent intake interview', true, NULL, NULL, '2026-05-06 23:28:46.376616+00', '2026-05-06 23:28:46.376616+00');
INSERT INTO public.time_entries (id, engagement_id, user_id, work_date, hours, description, billable, hourly_rate, invoice_id, created_at, updated_at) VALUES ('93414d50-0ab9-4ce7-881f-b2182c5a9620', 'ea5cdb44-1f44-4aa9-ab32-561ae3fdab78', '34d95bfb-501d-4970-a9d7-e6848c373c33', '2026-04-25', 1.00, 'Initial document review', true, NULL, NULL, '2026-05-06 23:28:46.376616+00', '2026-05-06 23:28:46.376616+00');


--
-- Name: audit_log_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.audit_log_id_seq', 386, true);


--
-- PostgreSQL database dump complete
--

