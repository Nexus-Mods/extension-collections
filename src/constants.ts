export const MOD_TYPE = 'collection';
export const NAMESPACE = 'modpack';
export const AUTHOR_UNKNOWN = '<Unknown User>';
export const AVATAR_FALLBACK = 'assets/images/noavatar.png';
export const NEXUS_DOMAIN = process.env['NEXUS_DOMAIN'] || 'nexusmods.com';
export const NEXUS_BASE_URL = process.env['NEXUS_BASE_URL'] || `https://www.${NEXUS_DOMAIN}.com`;
export const NEXUS_NEXT_URL = process.env['NEXUS_NEXT_URL'] || `https://www.${NEXUS_DOMAIN}.com`;
export const NEXUS_PROTOCOL = 'https:';

export const PREMIUM_PATH = ['account', 'billing', 'premium'];

export const TOS_URL = 'https://help.nexusmods.com/article/115-collections-terms-of-service';

export const BUNDLED_PATH = 'bundled';

export const INSTALLING_NOTIFICATION_ID = 'installing-collection-';

// limits
export const MIN_COLLECTION_NAME_LENGTH = 3;
export const MAX_COLLECTIION_NAME_LENGTH = 36;
