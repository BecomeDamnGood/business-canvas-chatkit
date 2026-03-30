import { UI_STRINGS_SOURCE_EN } from "../../ui_strings_defaults.js";

export const UI_STRINGS_LOCALE_AR: Record<string, string> = {
    ...UI_STRINGS_SOURCE_EN,
    "strategy.focuspoints.count.template": "لديك الآن {0} من نقاط التركيز ضمن استراتيجيتك.",
    "strategy.focuspoints.warning.template": "يتم عرض أكثر من 7 نقاط تركيز حاليًا.",
    "strategy.focuspoints.guidance.min.template":
      "لديك الآن {0} من الحد الأدنى البالغ {1} من نقاط التركيز.",
    "strategy.focuspoints.guidance.max.template":
      "أنصح بالإبقاء على حد أقصى قدره {0} من نقاط التركيز حتى يظل الأمر واضحًا.",
    "rulesofthegame.count.template": "لديك الآن {0} من قواعد اللعبة.",
    "rulesofthegame.guidance.min.template":
      "لديك الآن {0} من الحد الأدنى البالغ {1} من قواعد اللعبة.",
    "rulesofthegame.guidance.max.template":
      "أنصح بالإبقاء على حد أقصى قدره {0} من قواعد اللعبة حتى يظل الأمر واضحًا.",
    "rulesofthegame.current.template": "قواعد اللعبة الحالية لـ {0} هي:",
    "compare.feedback.compare.intro.template":
      "إليك مقارنة خاصة بـ {0}.",
    "compare.feedback.dream_builder.rewrite.default":
      "هذا الاقتراح يوسّع الصياغة لهذه الخطوة.",
    "compare.feedback.user_pick.ack.default": "تم الإبقاء على صياغتك.",
    "compare.feedback.user_pick.reason.default": "تظل الصياغة مناسبة لهذه الخطوة.",
    "compareGroupedUserLabel": "هذه هي صياغتك المختصرة:",
    "compareGroupedCompareSuggestionLabel": "هذا هو اقتراحي:",
    "compareGroupedCompareInstruction": "اختر النسخة التي تناسب الاختلاف المتبقي بشكل أفضل.",
    "compareGroupedCompareRetainedHeading": "هذه النقاط ستبقى بالفعل في القائمة النهائية:",
    "dreamBuilder.question.base": "إذا نظرت من 5 إلى 10 سنوات إلى الأمام، فما الفرص أو التهديدات الكبرى التي تراها، وما التغييرات الإيجابية التي تأملها؟ صُغها كعبارات واضحة.",
    "dreamBuilder.question.more": "إذا نظرت من 5 إلى 10 سنوات إلى الأمام، فما الفرص أو التهديدات الكبرى الأخرى التي تراها، وما التغييرات الإيجابية التي تأملها؟ صُغها كعبارات واضحة.",
    "dreamBuilder.resumeExercise": "تابع التمرين القصير الذي يساعد على تحديد حلمك.",
    "dreamBuilder.switchSelf.headline": "تابع مع تمرين الحلم.",
    "dreamBuilder.switchSelf.body.intro": "هذه بداية قوية. كتابة حلمك بنفسك تساعدك على توضيح ما يهمك فعلاً لك ولشركتك.",
    "dreamBuilder.switchSelf.body.helper": "خذ لحظة لكتابة مسودة أولى لحلمك. سأساعدك على تحسينها عند الحاجة.",
    "meta.topic.noStartingPoint.body": "تم تصميم هذا الـ Canvas Builder لتحويل فكرة أو اتجاه قائم إلى اختيارات استراتيجية واضحة وقابلة للتنفيذ وقصة مترابطة. يعمل بشكل أفضل عندما يكون لديك اتجاه مبدئي، حتى لو كان ما زال أوليًا. إذا لم يكن لديك أي نقطة انطلاق أو لم تحدد بعد مجال مشكلة واضحًا، فمن الأفضل عادةً استكشاف فكرة أولية أولًا ثم استخدام هذا المسار لصقلها وتنظيمها.",
} as const;
