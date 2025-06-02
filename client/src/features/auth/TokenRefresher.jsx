import React, { useState, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { loginSuccess } from './authSlice';
import api from '../../api/index.js';
import SessionExpiryModal from '../../components/SessionExpiryModal';
import { isTokenValid } from '../../utils/auth';
import socketService from '../../services/socketService';

/**
 * TokenRefresher - Component to handle token refreshing when it's about to expire
 * This component doesn't render anything normally but will show a modal
 * when the token is about to expire
 */
const TokenRefresher = () => {
  const [showExpiryModal, setShowExpiryModal] = useState(false);
  const [minutesRemaining, setMinutesRemaining] = useState(5);
  const dispatch = useDispatch();
  const authStatus = useSelector(state => state.auth.status);
  
  useEffect(() => {
    // Set up periodic token checks (every minute)
    const tokenCheckInterval = setInterval(() => {
      const tokenStatus = isTokenValid();
      
      // If token is valid and about to expire (less than 5 minutes)
      if (tokenStatus && tokenStatus.valid && tokenStatus.minutesRemaining <= 5) {
        setMinutesRemaining(tokenStatus.minutesRemaining);
        setShowExpiryModal(true);
        clearInterval(tokenCheckInterval);
      }
    }, 60 * 1000);
    
    return () => clearInterval(tokenCheckInterval);
  }, []);
  
  // Set up token monitoring and socket reconnection
  useEffect(() => {
    if (!authStatus) return;
    
    // Check token validity initially
    const tokenStatus = isTokenValid(true);
    
    // If token is invalid or about to expire, reconnect socket
    if (tokenStatus && tokenStatus.valid && tokenStatus.minutesRemaining < 10) {
      // Disconnect and reconnect socket with new token
      if (socketService.initialized) {
        socketService.disconnect();
        setTimeout(() => {
          socketService.connect();
        }, 500);
      }
    }
    
    // Set up interval to check token validity
    const intervalId = setInterval(() => {
      const tokenStatus = isTokenValid(true);
      
      // If token is valid but about to expire (<10 min)
      if (tokenStatus && tokenStatus.valid && tokenStatus.minutesRemaining < 10) {
        console.log('Token about to expire, reconnecting socket in preparation for refresh');
        
        // Socket will get new token after refresh
        if (socketService.initialized) {
          socketService.disconnect();
          setTimeout(() => {
            socketService.connect();
          }, 500);
        }
      }
      
      // If token is refreshed, reconnect socket
      if (tokenStatus && !tokenStatus.valid && socketService.initialized) {
        console.log('Token invalid, disconnecting socket');
        socketService.disconnect();
      }
    }, 30000); // Check every 30 seconds
    
    // Cleanup function
    return () => {
      clearInterval(intervalId);
    };
  }, [authStatus]);
  
  const handleExtendSession = async () => {
    try {
      // Get refresh token from localStorage (if stored)
      const refreshToken = localStorage.getItem('refreshToken');
      
      if (!refreshToken) {
        console.error("No refresh token available");
        return;
      }
      
      // Call the refresh token endpoint
      const response = await api.post('/auth/refresh-token', { refreshToken });
      
      // If successful, update tokens in localStorage
      if (response.data.token) {
        localStorage.setItem('token', response.data.token);
        
        // Save new refresh token
        if (response.data.refreshToken) {
          localStorage.setItem('refreshToken', response.data.refreshToken);
        }
        
        // Update auth state if user data is returned
        if (response.data.user) {
          dispatch(loginSuccess(response.data.user));
        }
        
        // Notify user
        console.log('Session extended successfully');
        
        // Could show a success notification
        if (window.Notification && Notification.permission === 'granted') {
          new Notification('Session Extended', {
            body: 'Your session has been extended successfully.'
          });
        }
      }
    } catch (error) {
      console.error('Failed to extend session:', error);
      // If refresh fails, user will be logged out automatically when token expires
    }
  };
  
  // Only render the modal when needed
  return showExpiryModal ? (
    <SessionExpiryModal 
      minutesRemaining={minutesRemaining} 
      onExtendSession={handleExtendSession} 
    />
  ) : null;
};

export default TokenRefresher; 