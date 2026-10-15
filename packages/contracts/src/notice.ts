/** A notice pushed on GET /api/notices/live the moment it is saved, for any signed-in role. */
export interface LiveNotice {
  id: string;
  title: string;
  body: string;
  link: string | null;
  createdAt: string;
}
