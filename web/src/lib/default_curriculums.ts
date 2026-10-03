// Static default curricula and daily quests for instant, zero-delay rendering on initial page load

export interface StaticCurriculum {
  id: string;
  grade_level: string;
  subject_name: string;
  file_name: string;
  units?: any[];
  is_placeholder?: boolean;
  track_id?: string | null;
  is_elective?: boolean;
  created_at: string;
}

export const DEFAULT_STATIC_CURRICULUMS: StaticCurriculum[] = [
  {
    "id": "77f5ee0d-af8e-4932-b1cf-279d13200dbc",
    "grade_level": "1_middle",
    "subject_name": "الدراسات الإجتماعية",
    "file_name": "الدراسات الإجتماعية.md",
    "is_placeholder": false,
    "track_id": null,
    "is_elective": false,
    "created_at": "2026-08-30T19:01:39.107+00:00"
  },
  {
    "id": "be52606f-837a-4514-895b-c3d6709f7c7a",
    "grade_level": "1_middle",
    "subject_name": "الرياضيات",
    "file_name": "الرياضيات.md",
    "is_placeholder": false,
    "track_id": null,
    "is_elective": false,
    "created_at": "2026-08-30T19:03:28.427+00:00"
  },
  {
    "id": "cc9e11d9-de69-4345-8ff8-c44429825180",
    "grade_level": "1_middle",
    "subject_name": "العلوم",
    "file_name": "العلوم.md",
    "is_placeholder": false,
    "track_id": null,
    "is_elective": false,
    "created_at": "2026-08-30T19:05:30.146+00:00"
  },
  {
    "id": "5c660ea9-0ca8-4d15-bcc5-ce7d6cbce81e",
    "grade_level": "1_middle",
    "subject_name": "اللغة الإنجليزية",
    "file_name": "اللغة الإنجليزية.md",
    "is_placeholder": false,
    "track_id": null,
    "is_elective": false,
    "created_at": "2026-08-30T19:14:19.92+00:00"
  },
  {
    "id": "41688f25-f11f-46b2-9a3f-63c768e61e46",
    "grade_level": "1_middle",
    "subject_name": "اللغة العربية",
    "file_name": "اللغة العربية.md",
    "is_placeholder": false,
    "track_id": null,
    "is_elective": false,
    "created_at": "2026-08-30T19:16:04.173+00:00"
  },
  {
    "id": "afce0ad1-e653-4123-8cd5-2c534f4f15b2",
    "grade_level": "2_middle",
    "subject_name": "الدراسات الإجتماعية",
    "file_name": "الدراسات الإجتماعية.md",
    "is_placeholder": false,
    "track_id": null,
    "is_elective": false,
    "created_at": "2026-08-30T19:17:43.686+00:00"
  },
  {
    "id": "71f6b3ce-fa0d-4880-995a-6f5c7dcf6533",
    "grade_level": "2_middle",
    "subject_name": "الرياضيات",
    "file_name": "الرياضيات.md",
    "is_placeholder": false,
    "track_id": null,
    "is_elective": false,
    "created_at": "2026-08-30T19:19:37.734+00:00"
  },
  {
    "id": "eb8ccff1-98d2-4a91-9953-6b7b2c29d7ce",
    "grade_level": "2_middle",
    "subject_name": "العلوم",
    "file_name": "العلوم.md",
    "is_placeholder": false,
    "track_id": null,
    "is_elective": false,
    "created_at": "2026-08-30T19:21:08.56+00:00"
  },
  {
    "id": "df4bfc49-148c-45fd-9819-d01016fd6f94",
    "grade_level": "2_middle",
    "subject_name": "اللغة الإنجليزية",
    "file_name": "اللغة الإنجليزية.md",
    "is_placeholder": false,
    "track_id": null,
    "is_elective": false,
    "created_at": "2026-08-30T19:23:15.147+00:00"
  },
  {
    "id": "46e54cb7-6765-4787-8f04-1fd6886c2618",
    "grade_level": "2_middle",
    "subject_name": "اللغة العربية",
    "file_name": "اللغة العربية.md",
    "is_placeholder": false,
    "track_id": null,
    "is_elective": false,
    "created_at": "2026-08-30T19:25:04.4+00:00"
  },
  {
    "id": "6b4f496b-cb4b-4bbb-82c5-60d28430c959",
    "grade_level": "2_high",
    "subject_name": "فيزياء",
    "file_name": "الفيزياء.md",
    "is_placeholder": false,
    "track_id": "medicine_life_sciences",
    "is_elective": true,
    "created_at": "2026-08-31T11:31:07.776+00:00"
  },
  {
    "id": "2066fe2d-b612-4095-99ad-557ba087a616",
    "grade_level": "2_high",
    "subject_name": "الرياضيات",
    "file_name": "الرياضيات.md",
    "is_placeholder": false,
    "track_id": "medicine_life_sciences",
    "is_elective": true,
    "created_at": "2026-08-31T11:31:16.031+00:00"
  },
  {
    "id": "797835b3-ede1-435a-8391-1ac5374d4e0c",
    "grade_level": "3_middle",
    "subject_name": "الدراسات الإجتماعية",
    "file_name": "الدراسات 3ع.md",
    "is_placeholder": false,
    "track_id": null,
    "is_elective": false,
    "created_at": "2026-08-31T07:03:21.59+00:00"
  },
  {
    "id": "326e6c00-f312-49f0-9987-0ece0f0d6e5b",
    "grade_level": "3_middle",
    "subject_name": "الرياضيات",
    "file_name": "الرياضيات 3ع.md",
    "is_placeholder": false,
    "track_id": null,
    "is_elective": false,
    "created_at": "2026-08-31T07:05:10.956+00:00"
  },
  {
    "id": "f527e4f7-d9ab-4a3f-80a4-6b8a74ca4232",
    "grade_level": "3_middle",
    "subject_name": "اللغة العربية",
    "file_name": "العربي 3 ع.md",
    "is_placeholder": false,
    "track_id": null,
    "is_elective": false,
    "created_at": "2026-08-31T07:06:47.666+00:00"
  },
  {
    "id": "f85b8508-4ad2-4b39-9536-cd111c651c1b",
    "grade_level": "3_middle",
    "subject_name": "العلوم",
    "file_name": "العلوم.md",
    "is_placeholder": false,
    "track_id": null,
    "is_elective": false,
    "created_at": "2026-08-31T07:08:28.517+00:00"
  },
  {
    "id": "b56ced16-f057-46c6-a0f5-c892e29c8f1f",
    "grade_level": "3_middle",
    "subject_name": "اللغة الإنجليزية",
    "file_name": "اللغة الانجليزية 3 ع.md",
    "is_placeholder": false,
    "track_id": null,
    "is_elective": false,
    "created_at": "2026-08-31T07:11:24.693+00:00"
  },
  {
    "id": "b8803a6c-46f6-490d-93c7-83f5b7ae5cc3",
    "grade_level": "2_high",
    "subject_name": "اللغة العربية",
    "file_name": "قيد الإعداد (بدون ملف)",
    "is_placeholder": true,
    "track_id": null,
    "is_elective": false,
    "created_at": "2026-08-31T11:30:39.923+00:00"
  },
  {
    "id": "ac7b9331-49c4-416d-bcd7-8f95fb84803b",
    "grade_level": "2_high",
    "subject_name": "اللغة الإنجليزية",
    "file_name": "اللغة الانجليزية.md",
    "is_placeholder": false,
    "track_id": null,
    "is_elective": false,
    "created_at": "2026-09-30T19:41:36.021Z",
    "units": [
        {
            "id": "2_high_eng_u1",
            "title": "الوحدة 1: العيش الجيد في عالم معقد - Unit 1: Living Well in a Complex World",
            "unitNumber": 1,
            "groupTitle": "المحور 1: الوعي والرفاهية الذاتية - Concept 1: Well-being",
            "lessons": [
                {
                    "id": "2_high_eng_u1_l1",
                    "title": "الدرس 1: وسائل التواصل الاجتماعي والصورة الذاتية - Lesson 1: Social Media and Self-Image",
                    "lessonNumber": 1,
                    "unitId": "2_high_eng_u1",
                    "unitTitle": "الوحدة 1: العيش الجيد في عالم معقد - Unit 1: Living Well in a Complex World",
                    "subtopics": [
                        "Key Vocabulary: Social media, self-image, unrealistic expectations, comparison culture, digital habits (مفردات وسائل التواصل والصورة الذاتية)",
                        "Definitions, Synonyms & Antonyms (التعريفات والمترادفات والمتضادات للوحدة الأولى)",
                        "Verbal Collocations & Expressions: Form an impression, project an image, measure self-worth (المتلازمات والتعبيرات اللغوية)",
                        "Language Notes: Absolute words, bias, perception vs. reality (ملاحظات لغوية واشتقاقات الكلمات)",
                        "Grammar Focus: Relative Clauses (ضمائر وعبارات الوصل المحددة وغير المحددة: who, whom, which, that, whose)",
                        "Relative Adverbs: Where, when, why (ظروف الوصل الزمانية والمكانية والسببية)",
                        "Reading Text & Critical Thinking: The impact of curated social media feeds on teen self-esteem (أثر المنشورات الافتراضية على تقدير الذات لدى المراهقين)",
                        "Writing Focus: Reflective Paragraph on healthy digital habits (كتابة فقرة تأملية عن تنظيم العادات الرقمية)"
                    ]
                },
                {
                    "id": "2_high_eng_u1_l2",
                    "title": "الدرس 2: استكشاف أنماط الحياة المعاصرة - Lesson 2: Exploring Modern Lifestyles",
                    "lessonNumber": 2,
                    "unitId": "2_high_eng_u1",
                    "unitTitle": "الوحدة 1: العيش الجيد في عالم معقد - Unit 1: Living Well in a Complex World",
                    "subtopics": [
                        "Key Vocabulary: Modern lifestyles, sedentary habits, work-life balance, mindfulness, digital detox (أنماط الحياة الحديثة والتوازن النفسي والبدني)",
                        "Important Vocabulary & Definitions (مفردات هامة وتعريفاتها الدقيقة)",
                        "Collocations, Idioms & Prepositions: Lead a balanced life, disconnect to reconnect, cope with pressure (المتلازمات وحروف الجر)",
                        "Language Notes: Clear up confusion between lifestyle words (الفروق اللغوية الدقيقة بين مصطلحات نمط الحياة)",
                        "Listening & Speaking: Prioritizing physical health and mental clarity in a fast-paced world (الحفاظ على الصحة البدنية والنقاء الذهني)",
                        "Writing Skills: Descriptive and Analytical Paragraph (كتابة فقرة وصفية وتحليلية لأنماط الحياة المعاصرة)"
                    ]
                },
                {
                    "id": "2_high_eng_u1_l3",
                    "title": "الدرس 3: على من تقع المسؤولية؟ - Lesson 3: Whose Responsibility Is It?",
                    "lessonNumber": 3,
                    "unitId": "2_high_eng_u1",
                    "unitTitle": "الوحدة 1: العيش الجيد في عالم معقد - Unit 1: Living Well in a Complex World",
                    "subtopics": [
                        "Key Vocabulary: Corporate responsibility, civic accountability, ethical standards, regulation (المسؤولية المؤسسية والمدنية والمعايير الأخلاقية)",
                        "Definitions & Synonyms (التعريفات والمترادفات لمفاهيم المسؤولية)",
                        "Verbal Collocations: Take responsibility, hold accountable, enforce regulations, protect user welfare (متلازمات تحمل المسؤولية والمحاسبة)",
                        "Language Notes & Word Families (الملاحظات اللغوية واشتقاقات الكلمات)",
                        "Reading Comprehension: Tech companies, platform moderation, and teenage well-being (دور منصات التكنولوجيا في سلامة المستخدمين)",
                        "Discussion & Debate: Individual agency vs. regulatory intervention (المسؤولية الفردية في مقابل التنظيم المؤسسي)"
                    ]
                },
                {
                    "id": "2_high_eng_u1_l4",
                    "title": "الدرس 4: فهم الصحة النفسية - Lesson 4: Understanding Mental Health",
                    "lessonNumber": 4,
                    "unitId": "2_high_eng_u1",
                    "unitTitle": "الوحدة 1: العيش الجيد في عالم معقد - Unit 1: Living Well in a Complex World",
                    "subtopics": [
                        "Key Vocabulary: Mental health, well-being, resilience, stigma, anxiety, coping mechanisms, empathy (الصحة النفسية، المرونة، آليات المواجهة، كسر الوصمة)",
                        "Definitions, Synonyms & Antonyms (التعريفات والمترادفات والمتضادات لمفاهيم الصحة النفسية)",
                        "Verbal Collocations & Prepositions: Overcome anxiety, build resilience, seek guidance, cope with stress (المتلازمات اللفظية وحروف الجر)",
                        "Grammar Focus: Conditionals & Advanced Conditional Rules (حالات if الشرطية الأربعة: Zero, First, Second, Third)",
                        "Advanced Conditionals: Unless, provided that, as long as, in case of, but for, without (بدائل وقواعد الشرط المتقدمة)",
                        "Reading Text: Destigmatizing mental health issues and creating supportive school environments (التوعية بالصحة النفسية وبيئات التعلم الداعمة)",
                        "Writing Skills: Argumentative Essay on youth mental health awareness (كتابة مقال إقناعي حول التوعية بالصحة النفسية)"
                    ]
                }
            ]
        },
        {
            "id": "2_high_eng_u2",
            "title": "الوحدة 2: أوقات الفراغ والأنشطة الترفيهية - Unit 2: Leisure Time",
            "unitNumber": 2,
            "groupTitle": "المحور 2: التجارب والخبرات - Concept 2: Experiences",
            "lessons": [
                {
                    "id": "2_high_eng_u2_l1",
                    "title": "الدرس 1: وقت الشاشة والشباب - Lesson 1: Screen Time and Young People",
                    "lessonNumber": 1,
                    "unitId": "2_high_eng_u2",
                    "unitTitle": "الوحدة 2: أوقات الفراغ والأنشطة الترفيهية - Unit 2: Leisure Time",
                    "subtopics": [
                        "Key Vocabulary: Screen time, passive consumption, attention span, digital boundary, binge-watching (وقت الشاشة، التصفح السلبي، مدى الانتباه)",
                        "Definitions, Synonyms & Antonyms (التعريفات والمترادفات والمتضادات)",
                        "Verbal Collocations & Expressions: Set boundaries, limit exposure, keep track of time (متلازمات تنظيم وقت الشاشة)",
                        "Language Notes: Boundary, limit, restrict, addict vs. addiction (ملاحظات لغوية)",
                        "Reading Comprehension: Guidelines and practical solutions for managing digital consumption (إرشادات وحلول عملية للتحكم في استهلاك الشاشات)",
                        "Writing Focus: Action plan for reducing screen dependency (خطة عمل لتقليل الاعتماد على الأجهزة الرقمية)"
                    ]
                },
                {
                    "id": "2_high_eng_u2_l2",
                    "title": "الدرس 2: الفنون الإبداعية كأنشطة ترفيهية - Lesson 2: Creative Arts as Leisure Activities",
                    "lessonNumber": 2,
                    "unitId": "2_high_eng_u2",
                    "unitTitle": "الوحدة 2: أوقات الفراغ والأنشطة الترفيهية - Unit 2: Leisure Time",
                    "subtopics": [
                        "Key Vocabulary: Creative arts, craftsmanship, pottery, painting, theatre, expressive hobbies (الفنون الإبداعية، الحرف اليدوية، التعبير الفني)",
                        "Definitions, Synonyms & Antonyms (التعريفات والمترادفات والمتضادات)",
                        "Verbal Collocations: Practice an art, express creativity, find solace in hobbies (متلازمات ممارسة الفنون)",
                        "Grammar Focus: Gerunds and Infinitives (الأفعال المتبوعة بالمصدر to + inf والأفعال المتبوعة بـ ing)",
                        "Verbs with Change in Meaning: Remember, forget, regret, stop, try (أفعال يتغير معناها مع المصدر أو الـ gerund)",
                        "Listening & Speaking: The therapeutic benefits of artistic expression for students (الفوائد النفسية والذهنية للأنشطة الإبداعية)"
                    ]
                },
                {
                    "id": "2_high_eng_u2_l3",
                    "title": "الدرس 3: الرياضة والنشاط البدني كوسيلة للترفيه - Lesson 3: Sport and Physical Activity as Leisure",
                    "lessonNumber": 3,
                    "unitId": "2_high_eng_u2",
                    "unitTitle": "الوحدة 2: أوقات الفراغ والأنشطة الترفيهية - Unit 2: Leisure Time",
                    "subtopics": [
                        "Key Vocabulary: Physical fitness, cardiovascular health, teamwork, stamina, sportsmanship, endorphins (اللياقة البدنية، الرياضات الجماعية، الروح الرياضية)",
                        "Definitions, Synonyms & Antonyms (التعريفات والمترادفات والمتضادات)",
                        "Verbal Collocations: Take up a sport, boost endurance, achieve a milestone (متلازمات الرياضة والنشاط البدني)",
                        "Grammar & Word Formation: Suffixes for Adjectives and Adverbs (-able, -ive, -ful, -less, -ly) (لواحق تكوين الصفات والظروف)",
                        "Reading Text: The lifelong impact of regular physical recreation on academic performance (أثر الرياضة المستمرة على التحصيل الدراسي)",
                        "Speaking: Organizing intramural athletic clubs and tournaments (تنظيم الأنشطة والبطولات الرياضية المدرسية)"
                    ]
                },
                {
                    "id": "2_high_eng_u2_l4",
                    "title": "الدرس 4: ليس يوماً مريحاً تماماً - Lesson 4: Not Exactly a Relaxing Day",
                    "lessonNumber": 4,
                    "unitId": "2_high_eng_u2",
                    "unitTitle": "الوحدة 2: أوقات الفراغ والأنشطة الترفيهية - Unit 2: Leisure Time",
                    "subtopics": [
                        "Key Vocabulary: Misadventures, outdoor excursions, unexpected setbacks, stamina, composure (مفارقات الرحلات، العقبات غير المتوقعة، الحفاظ على الهدوء)",
                        "Definitions, Synonyms & Antonyms (التعريفات والمترادفات والمتضادات)",
                        "Phrasal Verbs & Idioms: Wear on, struggle to keep up, fall behind, call it a day (الأفعال الاصطلاحية وتعبيرات المواقف الشاقة)",
                        "Language Notes: Subtle nuances in narrative phrasing (الفروق الدقيقة في الصياغة السردية)",
                        "Reading & Narrative Analysis: A humorous account of an exhausting weekend camping trip (نص سردي فكاهي عن رحلة تخييم مليئة بالتحديات)",
                        "Writing Skills: Narrative Essay writing techniques and vivid imagery (تقنيات كتابة المقال السردي والوصف الحي)"
                    ]
                }
            ]
        },
        {
            "id": "2_high_eng_u3",
            "title": "الوحدة 3: أصداء الماضي والتاريخ - Unit 3: Echoes of the Past",
            "unitNumber": 3,
            "groupTitle": "المحور 3: الهوية والتراث - Concept 3: Identity",
            "lessons": [
                {
                    "id": "2_high_eng_u3_l1",
                    "title": "الدرس 1: مواقع الذاكرة والتراث - Lesson 1: Sites of Memory",
                    "lessonNumber": 1,
                    "unitId": "2_high_eng_u3",
                    "unitTitle": "الوحدة 3: أصداء الماضي والتاريخ - Unit 3: Echoes of the Past",
                    "subtopics": [
                        "Key Vocabulary: Heritage sites, historical monuments, archeological preservation, tangible legacy, UNESCO (المواقع التراثية، المعالم الأثرية، الحفاظ والتوثيق)",
                        "Definitions, Synonyms & Antonyms (التعريفات والمترادفات والمتضادات لمفردات التراث)",
                        "Verbal Collocations & Prepositions: Restore monuments, safeguard heritage, bear witness to history (متلازمات حماية التراث)",
                        "Language Notes & Word Families (ملاحظات لغوية واشتقاقات الكلمات)",
                        "Reading Comprehension: Preserving Egypt’s historical landmarks and UNESCO sites (حماية المعالم التاريخية ومواقع التراث العالمي في مصر)",
                        "Speaking: Promoting cultural tourism and responsible visitation (تعزيز السياحة الثقافية والزيارة المسؤولة للمواقع الأثرية)"
                    ]
                },
                {
                    "id": "2_high_eng_u3_l2",
                    "title": "الدرس 2: المتحف كراوٍ للتاريخ - Lesson 2: The Museum as a Storyteller",
                    "lessonNumber": 2,
                    "unitId": "2_high_eng_u3",
                    "unitTitle": "الوحدة 3: أصداء الماضي والتاريخ - Unit 3: Echoes of the Past",
                    "subtopics": [
                        "Key Vocabulary: Curator, antiquities, interactive exhibits, archival storytelling, restoration (أمين المتحف، الآثار، المعارض التفاعلية، السرد التاريخي)",
                        "Definitions, Synonyms & Antonyms (التعريفات والمترادفات والمتضادات)",
                        "Collocations & Idioms: Curate an exhibit, bring history to life, shed light on (متلازمات العمل المتحفي وعرض الآثار)",
                        "Grammar Focus: Concession Clauses & Contrast (عبارات التناقض والاستدراك: although, even though, though, despite, in spite of, however, whereas)",
                        "Listening & Reading: The Grand Egyptian Museum (GEM) and modern museum curating (المتحف المصري الكبير وتجربة العرض المتحفي المعاصر)",
                        "Writing Skills: Descriptive review of a cultural exhibition (كتابة مراجعة وصفية لمعرض أثري أو متحف)"
                    ]
                },
                {
                    "id": "2_high_eng_u3_l3",
                    "title": "الدرس 3: الماضي الرقمي والانتشار الواسع - Lesson 3: The Viral Past",
                    "lessonNumber": 3,
                    "unitId": "2_high_eng_u3",
                    "unitTitle": "الوحدة 3: أصداء الماضي والتاريخ - Unit 3: Echoes of the Past",
                    "subtopics": [
                        "Key Vocabulary: Digital history, viral trends, historical democratization, 3D reconstruction, misinformation (التاريخ الرقمي، النمذجة ثلاثية الأبعاد، تحري الدقة)",
                        "Definitions, Synonyms & Antonyms (التعريفات والمترادفات والمتضادات)",
                        "Verbal Collocations: Spark viral interest, revive forgotten history, reconstruct artifacts (متلازمات الانتشار الرقمي والتراث)",
                        "Language Notes: Nuances of historical credibility online (المصداقية التاريخية في المحتوى الرقمي)",
                        "Reading & Critical Media Literacy: Evaluating digital claims about ancient history (النقد والتحليل الإعلامي للمعلومات التاريخية المتداولة)",
                        "Writing Skills: Discursive paragraph on digital history versus formal scholarship (فقرة مقارنة بين التوثيق الرقمي والبحث الأكاديمي)"
                    ]
                },
                {
                    "id": "2_high_eng_u3_l4",
                    "title": "الدرس 4: وسائل التواصل الاجتماعي والأحداث التاريخية - Lesson 4: Social Media and Historical Events",
                    "lessonNumber": 4,
                    "unitId": "2_high_eng_u3",
                    "unitTitle": "الوحدة 3: أصداء الماضي والتاريخ - Unit 3: Echoes of the Past",
                    "subtopics": [
                        "Key Vocabulary: Excavation, commemorative events, citizen documentation, public memory (التنقيب، الفعاليات التذكارية، التوثيق المجتمعي)",
                        "Definitions, Synonyms & Antonyms (التعريفات والمترادفات والمتضادات)",
                        "Language Notes: Fragile, remarkable, unprecedented, tangible vs. intangible (ملاحظات لغوية)",
                        "Listening Comprehension: How historical anniversaries are celebrated in the digital age (إحياء المناسبات التاريخية عبر الوسائط الحديثة)",
                        "Reading Text: Reconnecting youth with ancestral achievements through interactive media (ربط الشباب بإنجازات الأجداد عبر الإعلام التفاعلي)",
                        "Writing Skills: Formal Article commemorating an iconic Egyptian milestone (كتابة مقال رسمي تذكاري لحدث تاريخي مصري بارز)"
                    ]
                }
            ]
        },
        {
            "id": "2_high_eng_u4",
            "title": "الوحدة 4: قوة الاختيار وثقافة الاستهلاك - Unit 4: The Power of Choice",
            "unitNumber": 4,
            "groupTitle": "المحور 4: الاستهلاك والاختيار - Concept 4: Consumption and Choice",
            "lessons": [
                {
                    "id": "2_high_eng_u4_l1",
                    "title": "الدرس 1: هدر الطعام والاستهلاك المستدام - Lesson 1: Food Waste",
                    "lessonNumber": 1,
                    "unitId": "2_high_eng_u4",
                    "unitTitle": "الوحدة 4: قوة الاختيار وثقافة الاستهلاك - Unit 4: The Power of Choice",
                    "subtopics": [
                        "Key Vocabulary: Food waste, sustainable consumption, supply chains, leftovers, compost, perishables (هدر الطعام، الاستهلاك المستدام، سلاسل الإمداد، التدوير)",
                        "Definitions, Synonyms & Antonyms (التعريفات والمترادفات والمتضادات)",
                        "Verbal Collocations & Expressions: Minimize waste, manage portions, make conscious choices (متلازمات ترشيد الاستهلاك الغذائي)",
                        "Grammar Focus: Cause and Effect Structures (تراكيب وصيغ السبب والنتيجة: because of, owing to, due to, as a result, consequently, lead to)",
                        "Reading Comprehension: Global and Egyptian initiatives against food waste (مبادرات مكافحة هدر الطعام عالمياً وفي مصر)",
                        "Writing Focus: Proposal to reduce food waste in school cafeterias (مقترح عملي لتقليل هدر الطعام في المدارس)"
                    ]
                },
                {
                    "id": "2_high_eng_u4_l2",
                    "title": "الدرس 2: ما وراء العلامة التجارية - Lesson 2: Beyond the Brand",
                    "lessonNumber": 2,
                    "unitId": "2_high_eng_u4",
                    "unitTitle": "الوحدة 4: قوة الاختيار وثقافة الاستهلاك - Unit 4: The Power of Choice",
                    "subtopics": [
                        "Key Vocabulary: Ethical branding, fair trade, sweatshops, eco-friendly certification, transparency (العلامات التجارية الأخلاقية، التجارة العادلة، معايير الاستدامة)",
                        "Definitions, Synonyms & Antonyms (التعريفات والمترادفات والمتضادات)",
                        "Verbal Collocations & Prepositions: Boycott unethical practices, demand transparency, support local artisans (متلازمات الاستهلاك الواعي)",
                        "Language Notes: Brand awareness, consumer rights, genuine vs. counterfeit (ملاحظات لغوية والفروق الاصطلاحية)",
                        "Reading Text: Conscious consumer choices driving ethical market changes (أثر اختيارات المستهلكين الواعية في تحفيز التغيير في الأسواق)",
                        "Speaking: Analyzing product labels and corporate responsibility claims (تحليل ملصقات المنتجات ومعايير المسؤولية المجتمعية)"
                    ]
                },
                {
                    "id": "2_high_eng_u4_l3",
                    "title": "الدرس 3: الاستهلاك الرقمي وتشتت الانتباه - Lesson 3: Digital Consumption",
                    "lessonNumber": 3,
                    "unitId": "2_high_eng_u4",
                    "unitTitle": "الوحدة 4: قوة الاختيار وثقافة الاستهلاك - Unit 4: The Power of Choice",
                    "subtopics": [
                        "Key Vocabulary: Attention economy, microtransactions, notification fatigue, subscription traps, content binge (اقتصاد الانتباه، المعاملات الرقمية الدقيقة، إرهاق التنبيهات)",
                        "Definitions, Synonyms & Antonyms (التعريفات والمترادفات والمتضادات)",
                        "Collocations & Idioms: Drain attention, hook the user, fall prey to algorithms (متلازمات استنزاف الانتباه والاستهلاك الرقمي)",
                        "Listening Comprehension: Psychological tactics used in app design and in-app purchases (الأساليب النفسية المستخدمة في تصميم التطبيقات)",
                        "Reading & Critical Evaluation: Developing digital discipline and intentional browsing (بناء الانضباط الرقمي والتصفح الهادف)",
                        "Writing Skills: Cause-and-Effect Paragraph on digital overload (كتابة فقرة عن أسباب ونتائج الإفراط في الاستهلاك الرقمي)"
                    ]
                },
                {
                    "id": "2_high_eng_u4_l4",
                    "title": "الدرس 4: الجمعة السوداء وثقافة التخفيضات - Lesson 4: Black Friday and Sales Culture",
                    "lessonNumber": 4,
                    "unitId": "2_high_eng_u4",
                    "unitTitle": "الوحدة 4: قوة الاختيار وثقافة الاستهلاك - Unit 4: The Power of Choice",
                    "subtopics": [
                        "Key Vocabulary: Flash sales, impulsive buying, scarcity marketing, retail frenzy, buyer’s remorse (مواسم التخفيضات، الشراء الاندفاعي، التسويق عبر ندرة العرض)",
                        "Definitions, Synonyms & Antonyms (التعريفات والمترادفات والمتضادات)",
                        "Collocations & Prepositions: Slash prices, buy on impulse, resist promotional pressure (متلازمات الشراء ومقاومة الإغراءات التسويقية)",
                        "Language Notes: Financial literacy and smart shopping vocabulary (ملاحظات لغوية حول الثقافة المالية والشراء الذكي)",
                        "Reading Text: The psychological triggers behind seasonal mega-sales (المحفزات النفسية وراء مواسم التخفيضات الكبرى)",
                        "Writing Skills: Problem-Solution Essay on overcoming consumerism (كتابة مقال تقديم حلول لمشكلة الهوس الاستهلاكي)"
                    ]
                }
            ]
        },
        {
            "id": "2_high_eng_u5",
            "title": "الوحدة 5: ظاهرة الاحتباس الحراري والعمل البيئي - Unit 5: The Greenhouse Effect",
            "unitNumber": 5,
            "groupTitle": "المحور 5: مشاركة الكوكب - Concept 5: Sharing the Planet",
            "lessons": [
                {
                    "id": "2_high_eng_u5_l1",
                    "title": "الدرس 1: أزمة المناخ والتحديات البيئية - Lesson 1: The Climate Crisis",
                    "lessonNumber": 1,
                    "unitId": "2_high_eng_u5",
                    "unitTitle": "الوحدة 5: ظاهرة الاحتباس الحراري والعمل البيئي - Unit 5: The Greenhouse Effect",
                    "subtopics": [
                        "Key Vocabulary: Greenhouse effect, global warming, carbon emissions, sea level rise, extreme weather, biodiversity (الاحتباس الحراري، الانبعاثات، ارتفاع منسوب البحار، التنوع الحيوي)",
                        "Definitions, Synonyms & Antonyms (التعريفات والمترادفات والمتضادات للمفاهيم المناخية)",
                        "Verbal Collocations & Expressions: Curb emissions, pose an existential threat, combat global warming (متلازمات مواجهة التغير المناخي)",
                        "Language Notes: Nuances in environmental terminology (ملاحظات لغوية واصطلاحية حول قضايا المناخ)",
                        "Reading Comprehension: Scientific consensus on climate tipping points (الأدلة العلمية ونقاط التحول المناخي الحرجة)",
                        "Writing Skills: Argumentative Paragraph Structure (Topic sentence, Supporting evidence, Concession, Conclusion) (بناء وتطوير الفقرة الجدلية)"
                    ]
                },
                {
                    "id": "2_high_eng_u5_l2",
                    "title": "الدرس 2: الطاقة المتجددة نحو مستقبل مستدام - Lesson 2: Renewable Energy - Powering a Sustainable Future",
                    "lessonNumber": 2,
                    "unitId": "2_high_eng_u5",
                    "unitTitle": "الوحدة 5: ظاهرة الاحتباس الحراري والعمل البيئي - Unit 5: The Greenhouse Effect",
                    "subtopics": [
                        "Key Vocabulary: Solar energy, wind turbines, green hydrogen, fossil fuels, renewable transition (الطاقة الشمسية، توربينات الرياح، الهيدروجين الأخضر، التحول الطاقي)",
                        "Definitions, Synonyms & Antonyms (التعريفات والمترادفات والمتضادات لمفردات الطاقة المتجددة)",
                        "Verbal Collocations: Generate clean power, phase out coal, harness natural resources (متلازمات توليد واستغلال الطاقة النظيفة)",
                        "Grammar Focus: Modal Verbs of Obligation, Advice, Permission & Deduction (الأفعال الناقصة: should, must, have to, needn’t, can, could, may, might)",
                        "Listening Text: Egypt’s landmark green initiatives (Benban Solar Park and Zaafarana Wind Farm) (مشاريع مصر الرائدة: مجمع بنبان ومزرعة الزعفرانة)",
                        "Writing Focus: Informational Leaflet design, headlines, bullet points and call to action (تصميم وكتابة النشرة المعلوماتية الإرشادية)"
                    ]
                },
                {
                    "id": "2_high_eng_u5_l3",
                    "title": "الدرس 3: مشاريع التخضير في مصر - Lesson 3: Greening Projects in Egypt",
                    "lessonNumber": 3,
                    "unitId": "2_high_eng_u5",
                    "unitTitle": "الوحدة 5: ظاهرة الاحتباس الحراري والعمل البيئي - Unit 5: The Greenhouse Effect",
                    "subtopics": [
                        "Key Vocabulary: Afforestation, desert reclamation, urban greening, carbon sequestration, sustainable agriculture (التشجير، استصلاح الصحراء، الرئة الخضراء، الزراعة المستدامة)",
                        "Definitions, Synonyms & Antonyms (التعريفات والمترادفات والمتضادات لمشاريع التخضير)",
                        "Collocations & Prepositions: Embark on projects, transform barren lands, invest in sustainability (متلازمات المبادرات البيئية)",
                        "Grammar Focus: Adverbials of Degree, Frequency, Manner, Time & Place (ظروف الدرجة والتكرار والكيفية والزمان والمكان وموقعها في الجملة)",
                        "Adverbials in Argumentative Writing (توظيف الظروف لتقوية الحجج في الكتابة الإقناعية والجدلية)",
                        "Listening & Reading: Egypt’s Journey Towards a Greener Future and COP hosting legacy (مسيرة مصر نحو مستقبل أخضر وإرث استضافة مؤتمرات المناخ)"
                    ]
                },
                {
                    "id": "2_high_eng_u5_l4",
                    "title": "الدرس 4: المبادرات الفردية والجماعية لحماية البيئة - Lesson 4: Individual & Collective Actions",
                    "lessonNumber": 4,
                    "unitId": "2_high_eng_u5",
                    "unitTitle": "الوحدة 5: ظاهرة الاحتباس الحراري والعمل البيئي - Unit 5: The Greenhouse Effect",
                    "subtopics": [
                        "Key Vocabulary: Grassroots activism, carbon footprint, recycling campaigns, collective stewardship (المبادرات المجتمعية، البصمة الكربونية، حملات التدوير، المسؤولية الجماعية)",
                        "Definitions, Synonyms & Antonyms (التعريفات والمترادفات والمتضادات للعمل البيئي)",
                        "Verbal Collocations & Expressions: Mobilize communities, launch campaigns, spearhead initiatives (متلازمات إطلاق وقيادة المبادرات)",
                        "Reading Text: Inspiring Young Egyptians Taking Action for Our Planet (قصص ملهمة لشباب مصريين يقودون مبادرات لحماية البيئة)",
                        "Writing & Project Task: Crafting an actionable Environmental Community Plan (إعداد خطة عمل بيئية متكاملة للمدرسة والمجتمع المحلي)",
                        "Review & Reflection: Summary of major competencies and vocabulary across the curriculum (مراجعة شاملة للكفايات اللغوية والمهارات المكتسبة)"
                    ]
                }
            ]
        }
    ]
},
  {
    "id": "7acc8f8e-5ce7-4ca0-aca0-1bd2570249f8",
    "grade_level": "2_high",
    "subject_name": "كيمياء",
    "file_name": "قيد الإعداد (بدون ملف)",
    "is_placeholder": true,
    "track_id": "engineering_cs",
    "is_elective": true,
    "created_at": "2026-08-31T11:31:26.847+00:00"
  },
  {
    "id": "ad5505f1-28c6-4780-8d5d-3b0132b6a7c2",
    "grade_level": "2_high",
    "subject_name": "البرمجة",
    "file_name": "قيد الإعداد (بدون ملف)",
    "is_placeholder": true,
    "track_id": "engineering_cs",
    "is_elective": true,
    "created_at": "2026-08-31T11:31:34.805+00:00"
  },
  {
    "id": "9e1c34d6-3fa0-41cc-9e8d-d28f60c102c7",
    "grade_level": "2_high",
    "subject_name": "التاريخ المصري",
    "file_name": "Egyptian History.md",
    "is_placeholder": false,
    "track_id": null,
    "is_elective": false,
    "created_at": "2026-09-02T14:56:13.93+00:00"
  },
  {
    "id": "ba6a805b-91c1-4d2a-99a5-0223e754d669",
    "grade_level": "1_high",
    "subject_name": "التاريخ",
    "file_name": "التاريخ.md",
    "is_placeholder": false,
    "track_id": null,
    "is_elective": false,
    "created_at": "2026-09-03T20:02:18.762+00:00"
  },
  {
    "id": "43026669-c41e-45b3-be56-a8d800656bf8",
    "grade_level": "1_high",
    "subject_name": "الرياضيات",
    "file_name": "الرياضيات.md",
    "is_placeholder": false,
    "track_id": null,
    "is_elective": false,
    "created_at": "2026-09-03T20:04:06.323+00:00"
  },
  {
    "id": "85ff0930-efc2-431a-9ddc-66af3d600659",
    "grade_level": "1_high",
    "subject_name": "الفلسفة",
    "file_name": "الفلسفة.md",
    "is_placeholder": false,
    "track_id": null,
    "is_elective": false,
    "created_at": "2026-09-03T20:05:51.292+00:00"
  },
  {
    "id": "3d3c7b16-c369-4607-bc96-432e4e217b2f",
    "grade_level": "1_high",
    "subject_name": "اللغة العربية",
    "file_name": "اللغة العربية.md",
    "is_placeholder": false,
    "track_id": null,
    "is_elective": false,
    "created_at": "2026-09-03T20:07:36.878+00:00"
  },
  {
    "id": "9daf93f8-f2e9-4a7b-865a-67ba16b5f9b6",
    "grade_level": "1_high",
    "subject_name": "اللغة الإنجليزية",
    "file_name": "اللغة الانجليزية.md",
    "is_placeholder": false,
    "track_id": null,
    "is_elective": false,
    "created_at": "2026-09-03T20:10:09.439+00:00"
  },
  {
    "id": "4899fd46-003b-4b1e-8dbe-1961ea6c580d",
    "grade_level": "1_high",
    "subject_name": "العلوم",
    "file_name": "العلوم.md",
    "is_placeholder": false,
    "track_id": null,
    "is_elective": false,
    "created_at": "2026-09-03T20:12:47.103+00:00"
  }
];

export interface DailyQuestItem {
  id: string;
  title: string;
  description: string;
  icon: string;
  target: number;
  current: number;
  completed: boolean;
  rewardPoints: number;
  claimed: boolean;
}

export const DEFAULT_DAILY_QUESTS: DailyQuestItem[] = [
  {
    id: 'quest_interactive_quiz',
    title: 'سؤال تفاعلي سريع',
    description: 'حل سؤال تدريبي مع المعلم الذكي',
    icon: 'Sparkles',
    target: 1,
    current: 0,
    completed: false,
    rewardPoints: 2,
    claimed: false
  },
  {
    id: 'quest_concept_review',
    title: 'طرح 3 أسئلة دراسية',
    description: 'ناقش 3 نقاط أو مسائل دراسية اليوم',
    icon: 'Brain',
    target: 3,
    current: 0,
    completed: false,
    rewardPoints: 3,
    claimed: false
  },
  {
    id: 'quest_exam_challenge',
    title: 'خوض اختبار تقييمي',
    description: 'أكمل اختباراً تدريبياً لتقييم مستواك',
    icon: 'FileText',
    target: 1,
    current: 0,
    completed: false,
    rewardPoints: 5,
    claimed: false
  }
];

export const DEFAULT_DAILY_QUESTS_DATA = {
  quests: DEFAULT_DAILY_QUESTS,
  allCompleted: false,
  studyStreak: 1,
  totalRewardPoints: 10,
  earnedRewardPoints: 0
};
