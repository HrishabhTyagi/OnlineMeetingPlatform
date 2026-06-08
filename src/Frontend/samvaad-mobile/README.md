# Samvaad Mobile

React Native mobile client for Samvaad, built with Expo and wired to the existing API Gateway at `http://localhost:5000/api`.

## What Is Included

- Sign in and registration using the existing auth APIs.
- Personal and organization workspace switching.
- Classic and Focus themes.
- Calendar/dashboard with week and month style meeting lists.
- Meeting scheduling with attendees.
- Direct and group chat list, message sending, important messages, pinning, reactions, tasks, scheduled messages, image/file attachments, and unread badges.
- Offline outbox support for text messages that fail while the device is disconnected.
- Calls list with incoming call SignalR handling.
- Meeting room with participants, direct call into meeting, leave/end options, mute/video/share/record state controls, hand raise, reactions, meeting chat, details, notes, invites, invite response visibility, recording access, chat export, and whiteboard sync/export.
- Teams list and team creation.
- Dedicated Tasks screen with task creation, editing, status, priority, due date, delete, and linked-comment indicators.
- Dedicated Files screen for shared document preview and share-by-email.
- Dedicated Recordings screen for completed/recorded meeting access.
- Dedicated Profile screen for avatar upload/removal, presence, MFA setup/disable, local notification permission, and sign out.
- Dedicated Organization settings screen for switching organizations, retention/storage/file-size settings, and storage test.
- License purchase request screen with fake payment flow that sends a license request through the existing backend.
- SignalR notification plumbing for calls, meeting updates, chat updates, hand raise, reactions, and ended meetings.
- Mobile notification bridge for incoming calls, meeting invites, chat messages, task assignment, and meeting-ended events.
- Deep links for `samvaad://meeting/:meetingId`, `samvaad://tasks`, `samvaad://files`, `samvaad://recordings`, `samvaad://profile`, `samvaad://organization`, and `samvaad://license`.

## Run

```powershell
cd D:\Projects\OnlineMeetingPlatform\src\Frontend\samvaad-mobile
npm install
npm start
```

For Android emulator, the mobile client uses `http://10.0.2.2:5000/api` by default. For iOS simulator it uses `http://localhost:5000/api`.

To point at another gateway:

```powershell
$env:EXPO_PUBLIC_API_URL='http://YOUR_HOST:5000/api'
npm start
```

## Native Notes

Real camera/microphone calling is prepared with `react-native-webrtc`, `expo-camera`, and the current SignalR signaling layer. Expo Go cannot load every native module used for WebRTC, so use a development build with:

```powershell
npm run android
```

or

```powershell
npm run ios
```

## Backend Dependency

Run the same Samvaad backend services that the web client uses. The mobile app does not create a separate backend; it uses the existing API Gateway, tenant headers, SignalR hub, and secured file/recording endpoints.

## Smoke Reports

Recent local smoke reports are written under `D:\Projects\OnlineMeetingPlatform\artifacts`, including:

- `mobile-smoke-post-cors-report.json`
- `mobile-feature-smoke-report-2.json`
- `mobile-next-smoke-report.json`
