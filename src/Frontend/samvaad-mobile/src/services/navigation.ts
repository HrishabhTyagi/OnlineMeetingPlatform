import * as React from 'react';
import { RootStackParamList } from '../screens/RootNavigator';

export const navigationRef = React.createRef<any>();

export function navigateToMeeting(meetingId?: string | null) {
  if (!meetingId || !navigationRef.current) {
    return;
  }

  navigationRef.current.navigate('MeetingRoom', { meetingId });
}

export function navigateToScreen(name: keyof RootStackParamList) {
  if (!navigationRef.current) {
    return;
  }

  switch (name) {
    case 'Tasks':
      navigationRef.current.navigate('Tasks');
      break;
    case 'Files':
      navigationRef.current.navigate('Files');
      break;
    case 'Recordings':
      navigationRef.current.navigate('Recordings');
      break;
    case 'Profile':
      navigationRef.current.navigate('Profile');
      break;
    case 'OrganizationSettings':
      navigationRef.current.navigate('OrganizationSettings');
      break;
    case 'License':
      navigationRef.current.navigate('License');
      break;
    case 'Main':
      navigationRef.current.navigate('Main');
      break;
    default:
      break;
  }
}
