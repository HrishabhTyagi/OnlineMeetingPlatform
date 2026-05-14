-- Create databases for each microservice
CREATE DATABASE meeting_users;
CREATE DATABASE meeting_meetings;
CREATE DATABASE meeting_notifications;

-- Grant privileges
GRANT ALL PRIVILEGES ON DATABASE meeting_users TO postgres;
GRANT ALL PRIVILEGES ON DATABASE meeting_meetings TO postgres;
GRANT ALL PRIVILEGES ON DATABASE meeting_notifications TO postgres;
