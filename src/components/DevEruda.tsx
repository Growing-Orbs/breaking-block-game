'use client';

import { useEffect } from 'react';

export function DevEruda() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'development') return;
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const eruda = require('eruda');
    eruda.init();
  }, []);

  return null;
}
