// The app directory these checks run against: `itonami-app test` sets
// ITONAMI_APP_DIR to the repository's app/ (the lib's own tests set it to a
// fixture made by `itonami-app init`).
import { resolve } from "node:path";

if (!process.env.ITONAMI_APP_DIR) throw new Error("ITONAMI_APP_DIR is not set: run these checks through `itonami-app test`");
export const APP = resolve(process.env.ITONAMI_APP_DIR);
export const REPO = resolve(APP, "..");
