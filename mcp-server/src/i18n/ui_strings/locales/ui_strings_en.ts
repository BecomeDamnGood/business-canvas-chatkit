import { UI_STRINGS_SOURCE_EN } from "../../ui_strings_defaults.js";

export const UI_STRINGS_LOCALE_EN: Record<string, string> = {
    ...UI_STRINGS_SOURCE_EN,
    "rulesofthegame.count.template": "You now have {0} Rules of the Game. I advise you to formulate at least {1} and at most {2} Rules of the Game.",
    "rulesofthegame.current.template": "Your current Rules of the Game for {0} are:",
    "meta.topic.presentationMediaNotSupported.body": "Unfortunately, it is not yet possible to include images or logos in the presentation. We are working hard to make this possible in the future.",
} as const;
