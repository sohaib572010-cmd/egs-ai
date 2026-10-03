import { isEnglishSubject, getStageLevel } from './subject_helpers';

export interface ExamGenerationConfig {
  gradeLevel: string;
  subjectName: string;
  topic?: string;
  mode?: string;
  remedialConcepts?: string[];
  mcqCount?: number;
  tfCount?: number;
  essayCount?: number;
  totalCount?: number;
}

/**
 * Returns the official cognitive distribution and pedagogical standards for the given grade level
 * based on Egyptian Ministry of Education and NCEEE specifications.
 */
const SPEC_GRADES = ['1_middle', '2_middle', '3_middle', '1_high', '2_high'];

/** Admin-created stages use the specification of the closest built-in stage of the same level. */
function specGrade(gradeLevel: string): string {
  if (SPEC_GRADES.includes(gradeLevel)) return gradeLevel;
  const level = getStageLevel(gradeLevel);
  return level === 'preparatory' || level === 'primary' ? '2_middle' : gradeLevel;
}

export function getGradePedagogicalStandard(gradeLevel: string, subjectName: string): string {
  const isEnglish = isEnglishSubject(subjectName);

  switch (specGrade(gradeLevel)) {
    case '1_middle':
      return `[المرحلة الدراسية: الصف الأول الإعدادي - المنهج المطور الحديث]
1. الإطار العام للمواصفات:
   - تطبيق فلسفة المنهج المطور القائم على الاستقصاء العلمي والفهم التأسيسي وربط التعلم بالحياة اليومية والبيئة المحيطة.
   - الوزن النسبي للمستويات المعرفية:
     * 40% الفهم والاستيعاب المفاهيمي المباشر.
     * 40% التطبيق العملي وحل المشكلات البسيطة ذات الخطوة أو الخطوتين.
     * 20% مستويات التفكير العليا والاستنتاج الميسر والربط بين الظواهر.
2. ضوابط بناء الأسئلة وصياغتها:
   - لغة السؤال: صياغة عربية فصحى مبسطة ودقيقة، خالية تماماً من التعقيد اللفظي أو الألغاز اللغوية، واضحة ومباشرة للطالب في بداية المرحلة الإعدادية.
   - مادة العلوم: أسئلة قائمة على الملاحظة العلمية (خصائص المادة، الكثافة، تركيب الذرة والجزيئات، تحولات الطاقة، تنوع الكائنات الحية والتكيف)، مع تفسير مشاهدات وتجارب معملية مبسطة.
   - مادة الرياضيات: خطوات حسابية وجبرية متدرجة، مسائل لفظية مرتبطة بالواقع، وبراهين هندسية مؤسسة بوضوح (المعطيات، المطلوب، والبرهان المنظم).
   - مادة اللغة العربية: نصوص وقراءة متحررة بمفردات مألوفة، قياس الفكرة الرئيسة والأفكار الفرعية المباشرة، التذوق البلاغي الميسر (تضاد، ترادف، تشبيه صريح)، والنحو الوظيفي التأسيسي (أنواع الخبر، الأفعال المتعدية واللازمة، الضمائر).
   - مادة الدراسات الاجتماعية: قراءة الخرائط وتحديد الظواهر الجغرافية الطبيعية، ومعرفة أسباب الظواهر المناخية؛ وفي التاريخ فهم التسلسل الزمني لحضارة مصر القديمة والدوافع السياسية دون مطالبة بحفظ تواريخ جامدة.
3. معايير المشتتات والبدائل:
   - البدائل الأربعة في أسئلة الاختيار من متعدد يجب أن تكون متقاربة في الطول والتركيب اللغوي.
   - المشتتات تمثل أخطاء شائعة في الفهم الأولي لدى طلاب هذه المرحلة، وليست اختيارات مضللة أو غير منطقية.`;

    case '2_middle':
      return `[المرحلة الدراسية: الصف الثاني الإعدادي - المرحلة الإعدادية المتوسطة]
1. الإطار العام للمواصفات:
   - تعميق مهارات التفكير التحليلي والربط بين الظواهر وتوسيع القاعدة التطبيقية للطالب.
   - الوزن النسبي للمستويات المعرفية:
     * 30% الفهم والاستيعاب المفاهيمي.
     * 45% التطبيق وحل المسائل متعددة الخطوات.
     * 25% مهارات التفكير العليا والتحليل والمقارنة والتعليل العلمي.
2. ضوابط بناء الأسئلة وصياغتها:
   - مادة العلوم: قياس تدرج خواص العناصر في الجدول الدوري الحديث، الروابط الكيميائية، الحركة الاهتزازية والموجية وخصائص الصوت والضوء، طبقات الغلاف الجوي وظواهره، والسجل الأحفوري وأهميته وتفسير الانقراض.
   - مادة الرياضيات: تحليل المقادير الجبرية بأنواعها المختلفة، حل المعادلات، خصائص الأعداد الحقيقية، ونظريات هندسة المثلثات والمساحات ونظرية إقليدس وفيثاغورس.
   - مادة اللغة العربية: قراءة ونصوص متحررة تقيس استنتاج الدلالات الضمنية والعاطفة الغالبة والصور البيانية (استعارة مكنية، تشبيه مجمل)، والنحو التراكمي (المعرب والمبني، العطف، النعت، التوكيد، الحال).
   - مادة الدراسات الاجتماعية: جغرافية الوطن العربي (المناخ، الموارد المائية والاقتصادية، التوزيع السكاني)؛ والتاريخ الإسلامي (الدولة الإسلامية، الخلفاء الراشدين، الفتوحات، الحضارة الإسلامية) مع التركيز على أسباب الأحداث ونتائجها الحضارية.
3. معايير صياغة الأسئلة المقالية:
   - السؤال المقالي قصير ومركّز ويطلب تفسيراً علمياً محدداً (علل / ما النتائج المترتبة على / فسر) مع نموذج إجابة مبني على خطوات دقيقة.`;

    case '3_middle':
      return `[المرحلة الدراسية: الصف الثالث الإعدادي - الشهادة الإعدادية العامة]
1. الإطار العام للمواصفات (معايير المركز القومي للامتحانات ونظام البوكليت الموحد):
   - امتحانات الشهادة الإعدادية هي شهادة إتمام التعليم الأساسي وتخضع لمعايير قياسية موحدة على مستوى المحافظات.
   - الوزن النسبي للمستويات المعرفية:
     * 30% الفهم والتحصيل المعرفي الدقيق.
     * 40% التطبيق المباشر والمركب.
     * 30% مستويات التفكير العليا (حل المشكلات، الاستنتاج، التحليل، والربط).
2. ضوابط بناء الأسئلة بحسب المواد:
   - مادة العلوم:
     * الحركة والسرعة والعجلة (مسائل حسابية دقيقة مع الرسوم البيانية للعلاقة بين المسافة والزمن والسرعة).
     * الضوء والمرايا والعدسات (مسارات الأشعة الضوئية، تحديد موقع وخواص الصور، عيوب الإبصار وكيفية تصحيحها).
     * التفاعلات الكيميائية (الانحلال الحراري، الإحلال البسيط والمزدوج، تفاعلات الأكسدة والاختزال بالمفهوم التقليدي والإلكتروني، سرعة التفاعل والعوامل المؤثرة).
     * الانقسام الخلوي والتكاثر والوراثة (مبادئ مندل للوراثة وتفسير توارث الصفات على أسس وراثية).
   - مادة اللغة العربية:
     * القراءة المتحررة: نص متحرر عميق يتطلب استنباط المغزى الضمني، تحديد الفكرة الرئيسة والفرعية، التمييز بين الحقيقة والرأي.
     * النصوص الأدبية: تذوق بلاغي للصور والأخيلة وإبراز القيمة التعبيرية للمفردات والأساليب والتقديم والتأخير.
     * النحو التراكمي الشامل: (المنادى، الممنوع من الصرف وعلل منعه، البدل وأنواعه، أسلوبا المدح والذم، والمشتقات: اسم الفاعل، صيغ المبالغة، اسم المفعول، اسما الزمان والمكان، اسم الآلة، اسم التفضيل) مع ضبط الكلمات وبيان سبب الضبط.
   - مادة الرياضيات:
     * الجبر والإحصاء: حل معادلتين من الدرجة الأولى في متغيرين جبرياً وبيانياً، القانون العام للمعادلة التربيعية، النسب والكسور الجبرية وتحديد المجال والعمليات عليها، مقاييس التشتت والانحراف المعياري.
     * الهندسة التحليلية وحساب المثلثات: النسب المثلثية للزوايا الحادة، البعد بين نقطتين، إحداثيات منتصف قطعة مستقيمة، ميل الخط المستقيم ومعادلته.
     * هندسة الدائرة: علاقات الأوتار بالمركز، الزوايا المركزية والمحيطية والمماسية، والشكل الرباعي الدائري وخواصه.
   - مادة الدراسات الاجتماعية:
     * الجغرافيا: تضاريس قارات العالم والمناخ والنبات الطبيعي والسلالات البشرية والتوزيع السكاني والعوامل المؤثرة فيه.
     * التاريخ: تاريخ مصر الحديث والمعاصر (الحملة الفرنسية، محمد علي وبناء الدولة، الحركة الوطنية والثورة العرابية، ثورة 1919، ثورة 23 يوليو 1952، حرب أكتوبر 1973 ومسار السلام) مع التركيز الكامل على أسباب القرارات، نصوص المعاهدات وبنودها ونتائجها السياسية والدستورية.
3. التوزيع الدقيق للدرجات في نموذج الإجابة:
   - كل سؤال مقالي يجب أن يتضمن خطوات مقسمة في نموذج الإجابة (مثال: نصف درجة لكتابة القانون، نصف درجة للتعويض، نصف درجة للناتج ووحدة القياس).`;

    case '1_high':
      return `[المرحلة الدراسية: الصف الأول الثانوي - السنة التمهيدية في النظام الجديد وإعادة الهيكلة]
1. الإطار العام للمواصفات (نظام التابلت والتقييم الإلكتروني بوزارة التربية والتعليم):
   - السنة الأولى تمهيدية تركز على الانتقال الكامل من ثقافة الحفظ إلى ثقافة التفكير والتحليل.
   - تركيبة الورقة الامتحانية: 85% أسئلة اختيار من متعدد موضوعية و 15% أسئلة مقالية قصيرة.
   - الوزن النسبي للمستويات المعرفية:
     * 70% للمستويات البسيطة والمتوسطة (فهم المفاهيم، وتطبيقها في مواقف معتادة أو سياقات جديدة).
     * 30% للمستويات العليا والتفكير الناقد والتحليلي وحل المشكلات المعقدة.
2. ضوابط التقييم بحسب المواد المقررة الجديدة:
   - مادة العلوم المتكاملة (Integrated Sciences):
     * دمج المفاهيم الأساسية للكيمياء والفيزياء والأحياء في سياق علمي وتطبيقي موحد.
     * صياغة أسئلة تربط بين التفاعلات الكيميائية ومسارات الطاقة الحيوية والتأثيرات الفيزيائية (كالترموديناميكا وحركة الموائع والإشعاع الشمسي في الأنظمة البيئية).
     * تحليل المنحنيات والرسوم البيانية والعلاقات الرياضية بين المتغيرات المستقلة والتابعة في التجارب العلمية.
   - مادة الفلسفة والمنطق:
     * دراسة مواقف وسيناريوهات حياتية وفكرية واقعية، وتحديد أسلوب التفكير المستخدم (فلسفي، علمي، إبداعي، ديني، خرافي).
     * تحليل قضايا منطقية واستنتاج صدق الحجج الاستنباطية والاستقرائية وتمييز المغالطات المنطقية.
   - مادة التاريخ:
     * حضارات الشرق القديم وحضارات حوض البحر المتوسط (الحضارة المصرية القديمة، بلاد الرافدين، فينيقيا، اليونان، الرومان).
     * قياس التواصل الحضاري، دور الموقع الجغرافي، تحليل النصوص والمقولات والوثائق التاريخية القديمة، واستخلاص العبر من صعود وسقوط الممالك دون استرجاع أرقام وتواريخ جامدة.
   - مادة اللغة العربية:
     * قراءة ونصوص متحررة تحاكي العصور الأدبية المقررة، استخراج العلاقات الضمنية بين الجمل (إجمال بعد تفصيل، زعم وتفنيد، تعليل، نتيجة).
     * البلاغة: علم البيان (التشبيه والاستعارة والكناية والمجاز المرسل وسر جمالها وأثرها في المعنى)، علم البديع، وعلم المعاني.
     * النحو: كان وأخواتها التامة والناقصة، كاد وأخواتها (أفعال المقاربة والرجاء والشروع وأحكام اقتران خبرها بأن)، وإعمال المشتقات (اسم الفاعل، صيغ المبالغة، اسم المفعول).
   - مادة الرياضيات:
     * الجبر: تنظيم البيانات في مصفوفات، المحددات وطريقة كرامر، المتباينات الخطية والبرمجة الخطية، تحديد نوع جذري المعادلة التربيعية والعلاقة بين المعاملات والجذور.
     * حساب المثلثات: الزوايا الموجهة والدوال المثلثية والزوايا المنتسبة، حل المعادلات المثلثية والقطاع والقطعة الدائرية.
     * الهندسة المستوية والتحليلية: المتجهات والعمليات عليها وتطبيقاتها الفيزيائية، تقسيم قطعة مستقيمة، ومعادلة الخط المستقيم بصورها المختلفة.`;

    case '2_high':
      return `[المرحلة الدراسية: السنة الثانية بكالوريا - نظام شهادة البكالوريا المصرية المطورة]
================================================================================
المرجعية الوطنية الرسمية: نظام البكالوريا المصرية الجديد الصادر عن وزارة التربية والتعليم والتعليم الفني
هذه السنة هي المحطة المفصلية لشهادة البكالوريا التخصصية بمساراتها الأربعة:
1. مسار الطب وعلوم الحياة (Medicine & Life Sciences)
2. مسار الهندسة وعلوم الحاسب (Engineering & Computer Science)
3. مسار إدارة الأعمال (Business & Economics)
4. مسار الآداب والفنون (Arts & Humanities)

القاعدة المركزية الصارمة: الإلغاء الشامل والقطعي للحفظ والتلقين (Zero Rote Memorization):
- الطالب يدخل الامتحان ومعه "كتيب المفاهيم" المفتوح شاملاً كافة القوانين، القواعد، التعريفات، التواريخ، والصيغ.
- بناءً عليه، يُحظر تماماً صياغة أي سؤال يطلب استدعاء معلومة أو حفظ تعريف أو ذكر تاريخ أو استرجاع نص قانون.
- التوزيع الهيكلي للورقة الامتحانية:
  * 50% أسئلة اختيار من متعدد (MCQ) تحليلية عالية التمييز.
  * 50% أسئلة مقالية قصيرة (Short Essay) استنباطية ونقدية تطلب تقديم أدلة وحلول مبررة.
- الوزن النسبي للمستويات المعرفية: 100% مستويات تفكير عليا واستيعاب مفاهيمي عميق:
  * 35% الفهم المفاهيمي العميق (تفسير العلاقات المركبة وإعادة بناء المفاهيم في سياقات جديدة).
  * 40% التفكير النقدي والاستنباط المنطقي (فحص الحجج، كشف التناقضات والافتراضات الضمنية، والاستدلال من معطيات غير مألوفة).
  * 25% حل المشكلات المركبة وتطبيقات دراسة الحالة (Case Studies والتقييم الاستراتيجي).

================================================================================
المعايير التفصيلية للمواد الإنسانية والأدبية في البكالوريا المصرية (اللغة العربية والتاريخ):

أولاً: مادة اللغة العربية في البكالوريا المصرية:
1. القراءة المتحررة والنصوص الأدبية:
   - نصوص أدبية وفكرية متحررة عميقة ذات وجهات نظر متعددة أو متقابلة، تعالج قضايا إنسانية أو فلسفية أو اجتماعية.
   - أسئلة الاستنباط والمغزى الضمني: استنتاج ما وراء السطور، الدوافع النفسية للكاتب، ونبرة النص (تشاؤمية، سخرية مبطنة، اعتزاز، استنهاض، تحذير).
   - التفكير النقدي والمحاكمة العقلية:
     * التمييز بين (الادعاء، الرأي، والحقيقة المبرهنة بالدليل العلمي أو المنطقي).
     * تقييم مدى اتساق حجة الكاتب، وكشف المغالطات أو الفجوات في الاستدلال.
     * المقارنة النقدية بين نصين أدبيين أو فكريين لكاتبين تناولا نفس القضية بأسلوبين أو من زاويتين مختلفتين.
2. التذوق البلاغي الدلالي والتركيبي:
   - تجاوز تسمية الصور الجافة إلى تحليل القيمة الدلالية والوظيفة الجمالية (لماذا فضل الكاتب هذا التركيب اللغوي؟ ما الدلالة الشعورية لتقديم شبه الجملة؟ ما أثر الالتفات أو إيجاز الحذف في توجيه ذهن القارئ؟).
3. النحو الوظيفي الاستنباطي:
   - دراسة الشواهد والتراكيب اللغوية المعقدة التي يتوقف إعرابها على الفهم الدقيق لسياق المعنى (أثر الإعراب في تحديد المعنى وتوجيه الدلالة).
   - إعراب الكلمات في حالات التقديم والتأخير، حذف المبتدأ أو الخبر جوازاً ووجوباً، مواضع كسر همزة إنّ وفتحها وفق الدلالة، وجمل الإعراب وأشباه الجمل ذات الوظائف المزدوجة.
4. التعبير المقالي الموجه والنقدي:
   - كتابة تعليق نقدي مكثف ومبرر بالأدلة في حدود 6 إلى 8 أسطر يعالج قضية جدلية أو يفند رأياً غير متسق.

ثانياً: مادة التاريخ في البكالوريا المصرية:
1. المنع البات لاستدعاء التواريخ أو الأسماء المجردة:
   - ممنوع تماماً السؤال عن "في أي عام حدث..." أو "من هو القائد الذي...". التواريخ والأشخاص مدونة في كتيب المفاهيم المتاح للطالب.
2. نقد المصادر والوثائق التاريخية الأولية:
   - تقديم نص وثائقي، معاهدة تاريخية، منشور رسمي، مراسلات دبلوماسية سرية، أو خريطة عسكرية/سياسية، وتحليل أبعادها.
3. كشف الدوافع الخفية والواقعية السياسية (Realpolitik):
   - تحليل الدوافع والمصالح الاقتصادية والجيوسياسية الخفية التي قادت إلى اتخاذ القرارات أو عقد التحالفات أو توقيع المعاهدات (خلف الذرائع المعلنة).
4. الأثر الاستراتيجي والجيوسياسي الممتد:
   - تتبع الآثار بعيدة المدى للقرارات التاريخية على موازين القوى الإقليمية والدولية أو على البنية المجتمعية والاقتصادية.
5. التحليل التاريخي المقارن:
   - المقارنة بين سياسات حاكمين (مثل سياسة محمد علي الاقتصادية وسياسة خلفائه، أو أسلوب المقاومة الشعبية في ثورات مصر المختلفة، أو مقارنة بنود معاهدات كمعاهدة لندن 1840 ومعاهدة 1936).
6. التفكير الافتراضي والاستشرافي (Counterfactual Thinking):
   - تحليل بدائل تاريخية: "ماذا كان سيحدث لو غُيّر أحد المتغيرات الاستراتيجية؟" وقياس قدرة الطالب على استنتاج المسار المنطقي البديل بناءً على المعطيات التاريخية.

ثالثاً: المواد العلمية والرياضية والمسارات التخصصية في البكالوريا:
- مسار الطب وعلوم الحياة: سيناريوهات فسيولوجية ووراثية حية، آليات التغذية الراجعة الهرمونية (Hormonal Feedback Loops)، طفرات جينية وتأثيراتها، وتفسير تجارب حيوية دقيقة.
- مسار الهندسة وعلوم الحاسب: أنظمة ميكانيكية وفيزيائية متعددة المراحل، تفكير خوارزمي ورياضي متقدم، تحليل الدوائر المعقدة، والنمذجة الرياضية بالدوال والمشتقات والتكاملات.
- مسار إدارة الأعمال: دراسات حالة لشركات واقتصادات، تحليل قوى العرض والطلب والمرونة السعرية، السياسات النقدية والمالية، الموازنات الاستثمارية واتخاذ القرارات الإدارية تحت ظروف المخاطرة.`;

    default:
      return `[المرحلة الدراسية: المرحلة الثانوية العامة المصرية]
- الالتزام بنواتج التعلم الصادرة عن المركز القومي للامتحانات والتقويم التربوي.
- قياس الفهم العميق، التطبيق العملي، ومستويات التفكير العليا (التحليل، الاستنتاج، التقويم).
- المشتتات في الاختيار من متعدد ذكية ومؤسسة على الفهم المغلوط الشائع.
- الأسئلة المقالية دقيقة ومباشرة ولها خطوات تصحيح نموذجية محددة.`;
  }
}

/**
 * Generates the full system prompt for AI exam generation adhering to official Egyptian standards
 */
export function buildOfficialExamSystemPrompt(
  config: ExamGenerationConfig,
  curriculumText?: string
): string {
  const {
    gradeLevel,
    subjectName,
    topic,
    mode,
    remedialConcepts,
    mcqCount,
    tfCount,
    essayCount,
    totalCount
  } = config;

  const isEnglish = isEnglishSubject(subjectName);
  const isBaccalaureate = gradeLevel === '2_high';
  const isHighSchool = getStageLevel(gradeLevel) === 'secondary';
  const isPreparatory = ['preparatory', 'primary'].includes(getStageLevel(gradeLevel));

  const pedagogicalStandard = getGradePedagogicalStandard(gradeLevel, subjectName);

  const isRemedial = mode === 'remedial' || (Array.isArray(remedialConcepts) && remedialConcepts.length > 0);

  const adherenceInstruction = isRemedial
    ? `\nREMEDIAL DIAGNOSTIC FOCUS: This is a targeted remedial practice exam (exactly 3 questions) focusing specifically on helping the student overcome difficulties in these concepts: "${remedialConcepts?.join(', ')}". Every question must directly address one of these concepts.`
    : ((topic && topic !== 'المنهج بالكامل' && topic !== 'مراجعة المنهج بالكامل')
      ? `\nFOCUS TOPIC CONSTRAINT: All questions MUST focus specifically on this lesson/topic: "${topic}". Do not ask questions from unrelated chapters.`
      : '');

  let questionInstructions = '';
  if (isRemedial) {
    questionInstructions = `Exam Question Counts: Exactly 3 remedial questions (2 multiple_choice, 1 true_false or short essay) targeting these diagnostic difficulty concepts: ${remedialConcepts?.join(', ')}.`;
  } else if (mode === 'custom_types') {
    const mcqs = mcqCount !== undefined ? Number(mcqCount) : 0;
    const tfs = tfCount !== undefined ? Number(tfCount) : 0;
    const essays = essayCount !== undefined ? Number(essayCount) : 0;
    const total = mcqs + tfs + essays;
    questionInstructions = `Exam Question Counts: Exactly ${total} questions:
${mcqs > 0 ? `- Exactly ${mcqs} multiple-choice questions (multiple_choice) with 4 plausible options in ${isEnglish ? 'English' : 'Arabic'}.\n` : ''}${tfs > 0 ? `- Exactly ${tfs} true/false questions (true_false) where correct_answer is strictly "true" or "false".\n` : ''}${essays > 0 ? `- Exactly ${essays} short essay questions (essay) where correct_answer is the concise model answer in ${isEnglish ? 'English' : 'Arabic'}.\n` : ''}`;
  } else if (mode === 'total_only') {
    const total = totalCount !== undefined ? Number(totalCount) : (isBaccalaureate ? 6 : 5);
    if (isBaccalaureate) {
      const half = Math.floor(total / 2);
      const essayHalf = total - half;
      questionInstructions = `Exam Question Counts: Exactly ${total} questions strictly balanced according to Egyptian Baccalaureate standards: exactly ${half} analytical multiple_choice and ${essayHalf} critical thinking essay questions.`;
    } else if (gradeLevel === '1_high') {
      const mcqs = Math.max(1, Math.round(total * 0.85));
      const essays = total - mcqs;
      questionInstructions = `Exam Question Counts: Exactly ${total} questions following Grade 1 Secondary tablet proportions: ${mcqs} multiple_choice and ${essays > 0 ? essays + ' essay' : '1 essay'}.`;
    } else {
      questionInstructions = `Exam Question Counts: Exactly ${total} questions balanced across multiple_choice, true_false, and short essay suited for ${gradeLevel}.`;
    }
  } else {
    // Automatic balanced exam
    if (isBaccalaureate) {
      questionInstructions = `Exam Question Counts: Automatically generate exactly 6 high-rigor questions strictly balanced: exactly 3 analytical multiple_choice questions and 3 critical-thinking short essay questions adhering to Egyptian Baccalaureate methodology.`;
    } else if (gradeLevel === '1_high') {
      questionInstructions = `Exam Question Counts: Automatically generate exactly 6 questions following Secondary 1 ratios: 4 multiple_choice questions, 1 true_false question, and 1 short essay question.`;
    } else if (gradeLevel === '3_middle') {
      questionInstructions = `Exam Question Counts: Automatically generate exactly 5 questions following Grade 3 Preparatory booklet standards: 3 multiple_choice questions, 1 true_false question, and 1 short essay question with clear rubric steps.`;
    } else {
      questionInstructions = `Exam Question Counts: Automatically generate a balanced 5-question exam: 3 multiple_choice, 1 true_false, and 1 short essay.`;
    }
  }

  const languageMandate = isEnglish
    ? `- CRITICAL MANDATE FOR ENGLISH EXAMS: ALL USER-FACING TEXT (questions, options, explanations, model answers, titles) MUST BE STRICTLY AND ONLY IN ENGLISH. NEVER USE ARABIC IN QUESTIONS, OPTIONS, ANSWERS, OR EXPLANATIONS.
- NUMERALS MANDATE: ALL numerals MUST be written in English digits (0, 1, 2, 3, 4, 5, 6, 7, 8, 9).
- Multiple-choice questions MUST have 4 options strictly in English (e.g. ["Option A", "Option B", "Option C", "Option D"]).
- True/false questions: question in English, correct_answer "true" or "false", explanation in English.
- Essay questions: question in English, correct_answer concise model answer in English, explanation in English.
- Exam title MUST be in English (e.g. "English Exam: ${topic || 'Language Practice'}").`
    : `- ALL USER-FACING TEXT (questions, options, explanations, model answers, titles) MUST BE IN IMPECCABLE, FORMAL MODERN STANDARD ARABIC (اللغة العربية الفصحى السليمة والدقيقة لغوياً وأكاديمياً).
- NUMERALS MANDATE: ALL numerals (in question stems, options, problem values, given data, units, formulas, and explanations) MUST be written in Eastern Arabic numerals (٠، ١، ٢، ٣، ٤، ٥، ٦، ٧، ٨، ٩). English/Western digits (0-9) are strictly forbidden in Arabic exams.
- ABSOLUTELY ZERO COLLOQUIAL WORDS OR DIALECT PHRASING (ممنوع منعاً باتاً استخدام أي ألفاظ أو تراكيب عامية مثل: "إيه"، "ليه"، "مين"، "دول"، "علشان"، "ازاي"). Questions must conform to the formal academic standards of the Egyptian Ministry of Education and the National Center for Examinations.`;

  const schemaExample = isEnglish
    ? `{
  "title": "English Exam: ${topic || 'Comprehensive Practice'}",
  "subject_name": "${subjectName}",
  "grade_level": "${gradeLevel}",
  "questions": [
    {
      "id": "q1",
      "type": "multiple_choice",
      "question": "Which of the following sentences best demonstrates an action completed before another past event occurred?",
      "options": [
        "She had submitted the research report before the professor arrived.",
        "She has submitted the research report when the professor arrived.",
        "She was submitting the research report while the professor had arrived.",
        "She submitted the research report after the professor has arrived."
      ],
      "correct_answer": "She had submitted the research report before the professor arrived.",
      "explanation": "The Past Perfect ('had submitted') is specifically required to describe an action that happened prior to another past action ('arrived')."
    },
    {
      "id": "q2",
      "type": "true_false",
      "question": "In conditional sentences of type 2, the 'if-clause' uses the past simple to describe hypothetical or unlikely situations in the present or future.",
      "correct_answer": "true",
      "explanation": "Second conditional structures ('if + past simple, would + infinitive') express unreal, hypothetical, or improbable present/future conditions."
    },
    {
      "id": "q3",
      "type": "essay",
      "question": "Differentiate between the usage of 'must' for deduction and 'must' for obligation, providing a concise contextual example for each.",
      "correct_answer": "'Must' for deduction indicates strong logical certainty based on evidence (e.g., 'He has studied all day; he must be exhausted'). 'Must' for obligation expresses personal necessity or a strong rule (e.g., 'Students must wear uniforms').",
      "explanation": "Evaluation focuses on clear functional distinction between modal deduction and deontic obligation with valid examples."
    }
  ]
}`
    : `{
  "title": "${isRemedial ? 'تدريب علاجي: ' + (remedialConcepts?.slice(0, 2).join(' و ') || topic || subjectName) : (isBaccalaureate ? 'امتحان البكالوريا المصرية: ' + (topic || subjectName) : 'اختبار تقييم نواتج التعلم: ' + (topic || subjectName))}",
  "subject_name": "${subjectName}",
  "grade_level": "${gradeLevel}",
  "questions": [
    {
      "id": "q1",
      "type": "multiple_choice",
      "question": "${isBaccalaureate && (subjectName.includes('تاريخ') || subjectName.includes('التاريخ')) ? 'من خلال تحليل الأوضاع السياسية والاقتصادية لمصر قُبيل توقيع معاهدة لندن ١٨٤٠، ما الدافع الاستراتيجي الحقيقي المشترك الذي وحّد القوى الأوروبية الكبرى ضد مشروع محمد علي التوسعي؟' : 'في تجربة لدراسة أثر تركيز المتفاعلات على معدل التفاعل الكيميائي، لوحظ تضاعف سرعة التفاعل أربع مرات عند مضاعفة تركيز المادة (أ) مرتين مع ثبوت تركيز المادة (ب). ما الاستنتاج العلمي الأدق لرتبة التفاعل بالنسبة للمادة (أ)؟'}",
      "options": [
        "${isBaccalaureate && (subjectName.includes('تاريخ') || subjectName.includes('التاريخ')) ? 'الحفاظ على توازن القوى الدولي وتأمين خطوط المواصلات التجارية الإمبراطورية' : 'التفاعل من الرتبة الأولى بالنسبة للمادة (أ)'}",
        "${isBaccalaureate && (subjectName.includes('تاريخ') || subjectName.includes('التاريخ')) ? 'الرغبة في دعم استقلال الولايات العثمانية ومنحها حق تقرير المصير' : 'التفاعل من الرتبة الثانية بالنسبة للمادة (أ)'}",
        "${isBaccalaureate && (subjectName.includes('تاريخ') || subjectName.includes('التاريخ')) ? 'إنهاء التواجد العسكري الفرنسي تماماً في منطقة الشرق الأوسط' : 'التفاعل من الرتبة الصفرية ولا يعتمد على تركيز (أ)'}",
        "${isBaccalaureate && (subjectName.includes('تاريخ') || subjectName.includes('التاريخ')) ? 'إلغاء نظام الاحتكار داخل مصر لفتح أسواقها أمام المنتجات الروسية فقط' : 'التفاعل عكسي ويتناسب عكسياً مع مربع تركيز (أ)'}"
      ],
      "correct_answer": "${isBaccalaureate && (subjectName.includes('تاريخ') || subjectName.includes('التاريخ')) ? 'الحفاظ على توازن القوى الدولي وتأمين خطوط المواصلات التجارية الإمبراطورية' : 'التفاعل من الرتبة الثانية بالنسبة للمادة (أ)'}",
      "explanation": "${isBaccalaureate && (subjectName.includes('تاريخ') || subjectName.includes('التاريخ')) ? 'خشيت بريطانيا والدول الكبرى من اختلال التوازن الدولي بانهيار الدولة العثمانية وظهور دولة مصرية كبرى تهدد طرق التجارة إلى الهند، مما دفعها للتدخل وفرض التسوية.' : 'بما أن تضاعف التركيز مرتين ($٢$) أدى إلى زيادة سرعة التفاعل بمقدار $٢^٢ = ٤$ مرات، فإن معدل التفاعل يتناسب طردياً مع مربع التركيز، مما يثبت أن التفاعل من الرتبة الثانية.'}"
    },
    {
      "id": "q2",
      "type": "true_false",
      "question": "${isBaccalaureate && (subjectName.includes('عربي') || subjectName.includes('العربية')) ? 'تقديم الخبر شبه الجملة على المبتدأ المعرفة في التراكيب الأدبية يفيد وجوباً قصر الحكم وتخصيصه وتوكيد أهمية المتقدم في المعنى البلاغي.' : 'تزداد طاقة حركة الإلكترونات المنبعثة في ظاهرة التأثير الكهروضوئي بزيادة شدة الضوء الساقط عند ثبوت تردده أعلى من التردد الحرج.'}",
      "correct_answer": "${isBaccalaureate && (subjectName.includes('عربي') || subjectName.includes('العربية')) ? 'true' : 'false'}",
      "explanation": "${isBaccalaureate && (subjectName.includes('عربي') || subjectName.includes('العربية')) ? 'التقديم والتأخير في البلاغة العربية يفيد الاهتمام بالمتقدم والتخصيص والتوكيد، ويعد من ركائز علم المعاني.' : 'طاقة حركة الإلكترونات المنبعثة تتوقف فقط على تردد الضوء الساقط ودالة الشغل لمعدن المهبط، بينما تؤثر شدة الضوء الساقط على عدد الإلكترونات المنبعثة (شدة تيار الانبعاث) وليس طاقتها الحركية.'}"
    },
    {
      "id": "q3",
      "type": "essay",
      "question": "${isBaccalaureate && (subjectName.includes('تاريخ') || subjectName.includes('التاريخ')) ? 'استنتج تحليلياً: ما الأثر الجيوسياسي الممتد المترتب على فرض معاهدة لندن ١٨٤٠ على مكانة مصر الدولية والسيادية في النصف الثاني من القرن التاسع عشر؟' : 'علل علمياً: يفضل استخدام التيار المتردد عن التيار المستمر في نقل الطاقة الكهربية لمسافات طويلة من محطات التوليد إلى أماكن الاستهلاك.'}",
      "correct_answer": "${isBaccalaureate && (subjectName.includes('تاريخ') || subjectName.includes('التاريخ')) ? 'أدت المعاهدة إلى تقليص حدود مصر السياسية وحرمانها من انتصاراتها الخارجية، وربطت سيادتها بالسلطان العثماني (دفع جزية سنوية، تحديد الجيش بـ ١٨ ألف جندي، وخضوعها لمعاهدات الدولة العثمانية كاتفاقية بلطة ليمان)، مما أنهى استقلال مصر الفعلي ومهد للتدخل الأوروبي.' : 'لأنه يمكن رفع أو خفض جهده الكهربي بواسطة المحولات الكهربية، مما يتيح نقله عبر خطوط النقل بجهد فائق وتيار شدته منخفضة جداً، فتقل الطاقة الكهربية المفقودة في الأسلاك على هيئة حرارة ($ت^2 \\times م \\times ز$).'}",
      "explanation": "${isBaccalaureate && (subjectName.includes('تاريخ') || subjectName.includes('التاريخ')) ? 'الإجابة النموذجية تقيم قدرة الطالب على ربط المعاهدة بتقليص السيادة، التبعية المالية والعسكرية، وانهيار نظام الاحتكار، دون اشتراط سرد تواريخ مجردة.' : 'الإجابة النموذجية تشمل ذكر المحولات الكهربية، خفض شدة التيار، وتقليل الفقد الحراري في الأسلاك.'}"
    }
  ]
}`;

  return `You are the Principal Exam Generator for the Egyptian National Curriculum and the Egyptian Baccalaureate System (رئيس لجان واضعي امتحانات وزارة التربية والتعليم والمركز القومي للامتحانات والتقويم التربوي).
Your mission is to generate a pristine, academically rigorous, and pedagogically calibrated exam tailored strictly to the official grade-level specifications and Egyptian exam standards.

================================================================================
CRITICAL LANGUAGE & OUTPUT MANDATE:
${languageMandate}
- Format all mathematical, physical, and chemical formulas in standard LaTeX ($$ or $). Strictly avoid raw Unicode superscripts (⁰-⁹) or Unicode multiply (×) in plain text.
- Return strict JSON ONLY (no markdown fences, no conversational prose).

================================================================================
OFFICIAL PEDAGOGICAL & COGNITIVE SPECIFICATION FOR THIS EXAM:
${pedagogicalStandard}

================================================================================
CRITICAL EXAM QUESTION QUALITY RULES:
1. FULL COMPREHENSION & MEANING DERIVATION (الفهم العميق والاستنباط بدلاً من الحفظ والتلقين):
   - ALL questions must rely on full comprehension and the student's ability to derive meaning, relationships, and implications from the curriculum text.
   - ABSOLUTE PROHIBITION OF ROTE MEMORIZATION: Do NOT ask shallow questions asking for bare definitions ("ما هو تعريف...", "اذكر نص قانون..."), reciting dates or isolated numbers without context, or literal keyword matching.
   - Every question must assess understanding of underlying scientific/literary mechanisms, application to realistic scenarios, or analysis of cause-and-effect.

2. DISTRACTOR INTEGRITY & PLAUSIBILITY (معايير المشتتات في أسئلة الاختيار من متعدد):
   - For multiple_choice questions, all 4 options must be scientifically, grammatically, and semantically plausible.
   - Distractors must target genuine common misconceptions (المفاهيم البديلة الشائعة) so that only the student with true conceptual mastery selects the correct answer.
   - Strictly avoid absurd, humorous, or trivially eliminated distractors.
   - Distribute the correct answer evenly across options (do NOT always make Option 1 or Option A the correct answer).
   - The "correct_answer" field MUST be the exact verbatim string matching one of the options in the "options" array.

3. STRUCTURED SHORT ESSAY QUESTIONS (الأسئلة المقالية القصيرة):
   - Every short essay question must have a concise, unambiguous problem statement and a clear model answer ("correct_answer").
   - The "explanation" must outline the breakdown of sub-criteria or rubrics (e.g. key mechanism, evidence, calculation steps, or required deduction).

4. STRICT ACCURACY TO CURRICULUM BOUNDARIES:
   - All questions must be grounded in the concepts of the target subject and topic.
   - Zero filler questions, zero nonsensical queries.

Target Curriculum Context:
"""
${curriculumText ? curriculumText.slice(0, 10000) : 'General Egyptian Curriculum for ' + subjectName}
"""
${adherenceInstruction}
${questionInstructions}

JSON Output Schema:
${schemaExample}`;
}
