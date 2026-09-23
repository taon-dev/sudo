import { Translation } from "@taon-dev/i18n/src";
import { Taon } from "taon/src";

const t = Translation.for(Taon.__FILE_RELATIVE_PATH, Taon.LANG_IMPORT_MAP);

export function myOrgProj() {
  t.gettext('My Translated Company Name!')
}
