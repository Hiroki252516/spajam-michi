import React, { createContext, useContext, useState } from 'react';

interface EventContextType {
  selectedEventId: string | null;
  selectedEventName: string | null;
  isArrived: boolean;
  setSelectedEvent: (eventId: string, eventName: string) => void;
  setArrived: (arrived: boolean) => void;
  resetEvent: () => void;
}

const EventContext = createContext<EventContextType | undefined>(undefined);

/**
 * EventContext Provider
 * 選択されたイベント情報と状態を管理
 */
export const EventProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [selectedEventName, setSelectedEventName] = useState<string | null>(null);
  const [isArrived, setIsArrived] = useState(false);

  const setSelectedEvent = (eventId: string, eventName: string) => {
    setSelectedEventId(eventId);
    setSelectedEventName(eventName);
    setIsArrived(false);
  };

  const setArrived = (arrived: boolean) => {
    setIsArrived(arrived);
  };

  const resetEvent = () => {
    setSelectedEventId(null);
    setSelectedEventName(null);
    setIsArrived(false);
  };

  return (
    <EventContext.Provider
      value={{
        selectedEventId,
        selectedEventName,
        isArrived,
        setSelectedEvent,
        setArrived,
        resetEvent,
      }}
    >
      {children}
    </EventContext.Provider>
  );
};

/**
 * EventContext を使用するカスタムフック
 */
export const useEvent = () => {
  const context = useContext(EventContext);
  if (context === undefined) {
    throw new Error('useEvent must be used within an EventProvider');
  }
  return context;
};
