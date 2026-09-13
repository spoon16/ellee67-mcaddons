// Hand-edited settings for the add-on core. Feature-specific settings live next to each feature.

export const NAMESPACE = "elleedog67";

/** World dynamic property that stores whether a feature is enabled: `elleedog67:feature:<id>`. */
export const FEATURE_PROPERTY_PREFIX = `${NAMESPACE}:feature:`;

export const LOG_PREFIX = "[ElleeDog 67]";

/**
 * Gamertags that automatically receive the ElleeDog 67 Book when they join.
 * Matching ignores case and spaces and accepts any name that starts with one of these handles,
 * so "ElleeDog", "ElleeDog67" and "ElleeDog 67" all match.
 */
export const BOOK_HOLDER_HANDLES: readonly string[] = ["ElleeDog"];
