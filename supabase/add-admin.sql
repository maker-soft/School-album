-- Замените значение на UUID пользователя из Supabase → Authentication → Users
insert into public.admin_users(user_id)
values ('2958443e-66ea-431c-8eba-581a260177e6')
on conflict (user_id) do nothing;
