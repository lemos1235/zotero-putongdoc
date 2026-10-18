import { languages } from './config';

export const getLanguages = () => languages.map((language) => language.code);

export function getLanguageOptions(interfaceLanguage: string) {
  return languages.map((language) => ({
    value: language.code,
    label: interfaceLanguage.startsWith('zh') ? language.name : language.nameEn,
  }));
}

export function getLanguageName(code: string, interfaceLanguage: string) {
  const language = languages.find((language) => language.code === code);
  return language ? (interfaceLanguage.startsWith('zh') ? language.name : language.nameEn) : code;
}
