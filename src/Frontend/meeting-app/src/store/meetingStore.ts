import create from 'zustand';

export interface Meeting {
  id: string;
  organizerId: string;
  title: string;
  description?: string;
  startTime: string;
  endTime?: string;
  durationMinutes?: number;
  attendeeEmails: string[];
  location?: string;
  isOnlineMeeting: boolean;
  lobbyEnabled: boolean;
  allowChat: boolean;
  allowReactions: boolean;
  allowScreenShare: boolean;
  allowAttendeeUnmute: boolean;
  allowRecording: boolean;
  allowTranscription: boolean;
  recurrenceRule?: string;
  notes?: string;
  recap?: string;
  whiteboardData?: string;
  status: string;
  meetingLink?: string;
  isRecorded: boolean;
  recordingUrl?: string;
  maxParticipants: number;
  currentParticipants: number;
  createdAt: string;
}

export interface MeetingState {
  meetings: Meeting[];
  currentMeeting: Meeting | null;
  setMeetings: (meetings: Meeting[]) => void;
  addMeeting: (meeting: Meeting) => void;
  setCurrentMeeting: (meeting: Meeting | null) => void;
  updateMeeting: (id: string, updates: Partial<Meeting>) => void;
}

export const useMeetingStore = create<MeetingState>((set) => ({
  meetings: [],
  currentMeeting: null,
  setMeetings: (meetings) => set({ meetings }),
  addMeeting: (meeting) => set((state) => ({ meetings: [...state.meetings, meeting] })),
  setCurrentMeeting: (meeting) => set({ currentMeeting: meeting }),
  updateMeeting: (id, updates) =>
    set((state) => ({
      meetings: state.meetings.map((m) => (m.id === id ? { ...m, ...updates } : m)),
      currentMeeting:
        state.currentMeeting?.id === id
          ? { ...state.currentMeeting, ...updates }
          : state.currentMeeting,
    })),
}));
