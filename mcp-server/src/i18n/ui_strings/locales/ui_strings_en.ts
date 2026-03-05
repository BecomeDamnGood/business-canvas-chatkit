import { UI_STRINGS_SOURCE_EN } from "../../ui_strings_defaults.js";

export const UI_STRINGS_LOCALE_EN: Record<string, string> = {
    ...UI_STRINGS_SOURCE_EN,
    "meta.topic.presentationMediaNotSupported.body": "Unfortunately, it is not yet possible to include images or logos in the presentation. We are working hard to make this possible in the future.",
} as const;
