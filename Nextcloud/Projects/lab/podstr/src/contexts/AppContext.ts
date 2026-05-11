import { createContext } from "react";

export type Theme = "dark" | "light" | "system";

/** Content type for configurable home page sections */
export type SectionContentType = 'episode' | 'article' | 'post' | 'auto';

export interface AppConfig {
  /** Current theme */
  theme: Theme;
  /** Selected relay URL */
  relayUrl: string;
  /** Enable/disable zap (Lightning payment) UI across the entire app */
  zapsEnabled: boolean;
  /** Enable/disable long-form article (NIP-23) UI across the entire app */
  longFormEnabled: boolean;
  /** Content type for the hero "Latest" section on the home page */
  latestSection: SectionContentType;
  /** Content type for the "Recent" list section on the home page */
  recentSection: SectionContentType;
}

export interface AppContextType {
  /** Current application configuration */
  config: AppConfig;
  /** Update configuration using a callback that receives current config and returns new config */
  updateConfig: (updater: (currentConfig: AppConfig) => AppConfig) => void;
  /** Optional list of preset relays to display in the RelaySelector */
  presetRelays?: { name: string; url: string }[];
}

export const AppContext = createContext<AppContextType | undefined>(undefined);
