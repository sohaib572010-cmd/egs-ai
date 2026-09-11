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
    "file_name": "قيد الإعداد (بدون ملف)",
    "is_placeholder": true,
    "track_id": null,
    "is_elective": false,
    "created_at": "2026-08-31T11:30:49.85+00:00"
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
