/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext } from 'react';

const StudentContext = createContext();

export function useStudentContext() {
  const context = useContext(StudentContext);
  if (!context) {
    throw new Error('useStudentContext must be used within a StudentContextProvider');
  }
  return context;
}

export default StudentContext;
