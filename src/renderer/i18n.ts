import { PROVIDER_NAMES, type DiagnosticCode, type ProviderId, type SnapshotState } from '../shared/usage';

type MessageKey =
  | 'localOverlay' | 'refresh' | 'refreshing' | 'remaining' | 'reset' | 'notReported'
  | 'lastRead' | 'noVerifiedData' | 'updated' | 'stale' | 'unavailable' | 'frequency'
  | 'privacy' | 'claudeWorkspace' | 'chooseWorkspace' | 'noWorkspace' | 'trustHint'
  | 'minimize' | 'minutes' | 'availabilityRestored' | 'compact' | 'expanded'
  | 'searchCli' | 'searching' | 'useThisCli' | 'chooseCliManually' | 'cliHint'
  | 'noCandidatesFound' | 'detectedCli';

const messages = {
  es: {
    localOverlay: 'MONITOR LOCAL', refresh: 'Actualizar límites', refreshing: 'Actualizando',
    remaining: 'restante', reset: 'Reset', notReported: 'No informado', lastRead: 'Última lectura',
    noVerifiedData: 'Sin dato verificable', updated: 'Actualizado', stale: 'Último dato conservado',
    unavailable: 'No disponible', frequency: 'Actualizar',
    privacy: 'No usa API keys ni guarda credenciales: consulta la sesión ya autenticada de cada CLI local.',
    claudeWorkspace: 'Carpeta de Claude', chooseWorkspace: 'Elegir proyecto', noWorkspace: 'Sin proyecto elegido',
    trustHint: 'Abrí Claude una vez en esta carpeta y confirmá que confiás en ella.',
    minimize: 'Minimizar a la bandeja', minutes: 'cada {count} min',
    availabilityRestored: 'Límite disponible de nuevo: {provider} {bucket} tiene {percent}% restante.',
    compact: 'Vista compacta', expanded: 'Vista completa',
    searchCli: 'Buscar automáticamente', searching: 'Buscando…', useThisCli: 'Usar esta',
    chooseCliManually: 'Elegir manualmente…',
    cliHint: 'Suele estar en .codex\\.sandbox-bin, .local\\bin o AppData\\Local\\Programs.',
    noCandidatesFound: 'No encontramos ningún ejecutable en las ubicaciones habituales.',
    detectedCli: 'CLI',
  },
  en: {
    localOverlay: 'LOCAL MONITOR', refresh: 'Refresh limits', refreshing: 'Refreshing',
    remaining: 'remaining', reset: 'Reset', notReported: 'Not reported', lastRead: 'Last read',
    noVerifiedData: 'No verified data', updated: 'Updated', stale: 'Last verified data',
    unavailable: 'Unavailable', frequency: 'Refresh',
    privacy: 'No API keys or credentials are stored: it queries the already authenticated local CLI session.',
    claudeWorkspace: 'Claude workspace', chooseWorkspace: 'Choose project', noWorkspace: 'No project selected',
    trustHint: 'Open Claude in this folder once and confirm that you trust it.',
    minimize: 'Minimize to tray', minutes: 'every {count} min',
    availabilityRestored: 'Limit available again: {provider} {bucket} has {percent}% remaining.',
    compact: 'Compact view', expanded: 'Full view',
    searchCli: 'Search automatically', searching: 'Searching…', useThisCli: 'Use this',
    chooseCliManually: 'Choose manually…',
    cliHint: 'Usually under .codex\\.sandbox-bin, .local\\bin or AppData\\Local\\Programs.',
    noCandidatesFound: 'No executable was found in the usual locations.',
    detectedCli: 'CLI',
  },
} as const;

export type Language = keyof typeof messages;

export function languageFromLocale(locale: string): Language {
  return locale.toLocaleLowerCase().startsWith('es') ? 'es' : 'en';
}

export function translator(language: Language) {
  return (key: MessageKey, variables?: Record<string, string | number>) => {
    let text: string = messages[language][key];
    for (const [name, value] of Object.entries(variables ?? {})) text = text.replace(`{${name}}`, String(value));
    return text;
  };
}

export function stateLabel(language: Language, state: SnapshotState) {
  const t = translator(language);
  return state === 'ready' ? t('updated') : state === 'stale' ? t('stale') : t('unavailable');
}

export function providerName(_language: Language, provider: ProviderId) {
  return PROVIDER_NAMES[provider];
}

export function diagnosticLabel(language: Language, diagnostic?: DiagnosticCode) {
  const es = {
    'not-checked': 'Todavía no se consultó.', 'cli-not-found': 'CLI no encontrada en PATH.',
    'login-required': 'La CLI requiere iniciar sesión.', 'workspace-required': 'Elegí una carpeta de proyecto para Claude.',
    'trust-required': 'Claude requiere que confirmes confianza en la carpeta elegida.',
    timeout: 'La CLI no respondió antes del límite seguro.',
    'incompatible-output': 'La CLI no expuso un límite de plan verificable.',
    'probe-failed': 'No se pudo consultar la CLI local.',
  } as const;
  const en = {
    'not-checked': 'Not queried yet.', 'cli-not-found': 'CLI was not found in PATH.',
    'login-required': 'The CLI requires sign-in.', 'workspace-required': 'Choose a project folder for Claude.',
    'trust-required': 'Claude requires you to trust the selected folder.',
    timeout: 'The CLI did not respond before the safe deadline.',
    'incompatible-output': 'The CLI did not expose a verifiable plan limit.',
    'probe-failed': 'The local CLI could not be queried.',
  } as const;
  return diagnostic ? (language === 'es' ? es : en)[diagnostic] : undefined;
}
