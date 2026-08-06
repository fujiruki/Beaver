import { useLocation, useNavigate } from 'react-router-dom';

export function useSmartBack(fallbackPath: string) {
  const navigate = useNavigate();
  const location = useLocation();
  return () => {
    if (location.key && location.key !== 'default') {
      navigate(-1);
    } else {
      navigate(fallbackPath);
    }
  };
}
