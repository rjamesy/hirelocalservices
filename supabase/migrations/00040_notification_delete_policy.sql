-- Allow users to delete their own notifications
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'user_notifications' AND policyname = 'Users can delete own notifications') THEN
    CREATE POLICY "Users can delete own notifications" ON user_notifications
      FOR DELETE USING (auth.uid() = user_id);
  END IF;
END $$;
