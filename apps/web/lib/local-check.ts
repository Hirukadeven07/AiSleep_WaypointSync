/**
 * The local check tool (tools/local-admin) for developers. Its link shows on the role chooser and
 * dock sign-in only when NEXT_PUBLIC_LOCAL_CHECK_URL is set, so the public site never links to
 * a developer's own machine.
 */
export const LOCAL_CHECK_URL = process.env.NEXT_PUBLIC_LOCAL_CHECK_URL || '';
