export const MOD_TYPE = 'collection';
export const NAMESPACE = 'collection';
export const AUTHOR_UNKNOWN = '<Unknown User>';
export const AVATAR_FALLBACK = 'assets/images/noavatar.png';
export const NEXUS_DOMAIN = process.env['NEXUS_DOMAIN'] || 'nexusmods.com';
export const NEXUS_BASE_URL = process.env['NEXUS_BASE_URL'] || `https://www.${NEXUS_DOMAIN}`;
export const NEXUS_NEXT_URL = process.env['NEXUS_NEXT_URL'] || `https://www.${NEXUS_DOMAIN}`;
export const NEXUS_PROTOCOL = 'https:';

export const PREMIUM_PATH = ['account', 'billing', 'premium'];

export const TOS_URL = 'https://help.nexusmods.com/article/115-guidelines-for-collections';

export const BUNDLED_PATH = 'bundled';

export const INSTALLING_NOTIFICATION_ID = 'installing-collection-';

// limits
export const MIN_COLLECTION_NAME_LENGTH = 3;
export const MAX_COLLECTION_NAME_LENGTH = 36;

export const INI_TWEAKS_PATH = 'Ini Tweaks';

// Although the required property has been removed,
//  we're keeping this for backwards compatibility as
//  some released collections could still have it.
export const OPTIONAL_TWEAK_PREFIX = '(optional).';

// time after installing a revision before we ask for a vote. in milliseconds
export const TIME_BEFORE_VOTE = 48 * 60 * 60 * 1000;
// upon start, time before we first check whether a revision needs to be rated. in milliseconds
export const DELAY_FIRST_VOTE_REQUEST = 1 * 60 * 1000;
