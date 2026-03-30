import { UI_STRINGS_SOURCE_EN } from "../../ui_strings_defaults.js";

export const UI_STRINGS_LOCALE_EN: Record<string, string> = {
    ...UI_STRINGS_SOURCE_EN,
    "strategy.focuspoints.guidance.min.template": "You now have {0} of the minimum {1} focus points.",
    "strategy.focuspoints.guidance.max.template":
      "I recommend keeping it to at most {0} focus points so it stays clear.",
    "rulesofthegame.count.template": "You now have {0} Rules of the Game.",
    "rulesofthegame.guidance.min.template":
      "You now have {0} of the minimum {1} Rules of the Game.",
    "rulesofthegame.guidance.max.template":
      "I recommend keeping it to at most {0} Rules of the Game so it stays clear.",
    "rulesofthegame.current.template": "Your current Rules of the Game for {0} are:",
    "meta.topic.presentationMediaNotSupported.body": "Unfortunately, it is not yet possible to include images or logos in the presentation. We are working hard to make this possible in the future.",
} as const;
