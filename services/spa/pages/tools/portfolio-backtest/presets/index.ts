/**
 * slug → editorial body. Every preset in the registry must have an entry here;
 * a missing one is a TYPE error, the compile-time twin of the prerender's
 * "component not registered" guard.
 */
import type { ComponentType } from "react";
import DividendCopy from "./dividend";
import SpyCopy from "./spy";
import QqqCopy from "./qqq";
import SpyVsQqqCopy from "./spy-vs-qqq";
import SchdVsVymCopy from "./schd-vs-vym";
import JepiVsSchdCopy from "./jepi-vs-schd";
import SchdCopy from "./schd";

export const PRESET_COPY: Record<string, ComponentType> = {
  dividend: DividendCopy,
  spy: SpyCopy,
  qqq: QqqCopy,
  "spy-vs-qqq": SpyVsQqqCopy,
  "schd-vs-vym": SchdVsVymCopy,
  "jepi-vs-schd": JepiVsSchdCopy,
  schd: SchdCopy,
};
