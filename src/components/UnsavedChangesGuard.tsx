import { useCallback, useContext, useEffect } from 'react';
import { UNSAFE_DataRouterContext, useBlocker, type BlockerFunction } from 'react-router-dom';

interface Props {
  when: boolean;
  message: string;
  /** The fretboard can replace its working selection when its query changes. */
  includeSearch?: boolean;
}

function RouterGuard({ when, message, includeSearch }: Props) {
  const shouldBlock = useCallback<BlockerFunction>(({ currentLocation, nextLocation }) => {
    return when && (currentLocation.pathname !== nextLocation.pathname || (!!includeSearch && currentLocation.search !== nextLocation.search));
  }, [when, includeSearch]);
  const blocker = useBlocker(shouldBlock);
  useEffect(() => {
    if (blocker.state !== 'blocked') return;
    if (window.confirm(message)) blocker.proceed();
    else blocker.reset();
  }, [blocker, message]);
  return null;
}

/** Warn for SPA navigation as well as refresh, tab close and external navigation. */
export default function UnsavedChangesGuard(props: Props) {
  const dataRouter = useContext(UNSAFE_DataRouterContext);
  useEffect(() => {
    if (!props.when) return;
    const beforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, [props.when]);
  // Browser deployments use a data router. Legacy MemoryRouter component tests
  // still get the beforeunload guard, while dedicated tests exercise useBlocker.
  return dataRouter ? <RouterGuard {...props} /> : null;
}
