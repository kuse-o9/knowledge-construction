-- Support account-reference checks without scanning the new private history tables.
create index if not exists study_notices_updated_by on study_private.study_notices(updated_by);
create index if not exists study_notice_history_actor on study_private.study_notice_history(actor);
create index if not exists feedback_admin_archive_updated_by on study_private.feedback_admin_archive(updated_by);
create index if not exists feedback_archive_history_actor on study_private.feedback_archive_history(actor);
