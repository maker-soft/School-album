-- Замените значение на UUID пользователя из Supabase → Authentication → Users
insert into public.admin_users(user_id)
values ('304b8315-8663-44c2-b4ff-8b4f79665270')
on conflict (user_id) do nothing;
