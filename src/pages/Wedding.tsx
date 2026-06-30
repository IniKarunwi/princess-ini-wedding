import { useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import Landing from '@/components/wedding/Landing';
import Abuja from '@/components/wedding/Abuja';
import Venue from '@/components/wedding/Venue';
import Chair from '@/components/wedding/Chair';
import RSVPDecision from '@/components/wedding/RSVPDecision';
import RSVPForm, { RSVPFormValues } from '@/components/wedding/RSVPForm';
import Confirmation from '@/components/wedding/Confirmation';
import Regrets from '@/components/wedding/Regrets';
import { submitRSVP } from '@/lib/supabase';

type Screen =
  | 'landing'
  | 'abuja'
  | 'venue'
  | 'chair'
  | 'rsvp-decision'
  | 'rsvp-form-attending'
  | 'rsvp-form-regrets'
  | 'confirmation'
  | 'regrets'
  | 'duplicate';

export default function Wedding() {
  const [screen, setScreen] = useState<Screen>('landing');
  const [guestName, setGuestName] = useState('');

  async function handleRSVPSubmit(data: RSVPFormValues, attending: boolean) {
    setGuestName(data.fullName);
    const result = await submitRSVP({
      full_name: data.fullName,
      email: data.email,
      phone: data.phone,
      guest_count: data.guestCount,
      attending,
    });
    if (result.error === 'duplicate') {
      setScreen('duplicate');
    } else {
      setScreen(attending ? 'confirmation' : 'regrets');
    }
  }

  return (
    /*
     * Outer: full viewport, dark warm background visible on wide screens.
     * Inner: column capped at 480px, fills 100dvh so absolute children work.
     */
    <div
      className="w-full flex justify-center"
      style={{ minHeight: '100dvh', background: '#2c2420' }}
    >
      <div
        className="relative w-full overflow-hidden"
        style={{ maxWidth: '480px', height: '100dvh' }}
      >
        <AnimatePresence mode="wait">
          {screen === 'landing' && (
            <div key="landing" className="absolute inset-0">
              <Landing onNext={() => setScreen('abuja')} />
            </div>
          )}
          {screen === 'abuja' && (
            <div key="abuja" className="absolute inset-0">
              <Abuja onNext={() => setScreen('venue')} />
            </div>
          )}
          {screen === 'venue' && (
            <div key="venue" className="absolute inset-0">
              <Venue onNext={() => setScreen('chair')} />
            </div>
          )}
          {screen === 'chair' && (
            <div key="chair" className="absolute inset-0">
              <Chair onNext={() => setScreen('rsvp-decision')} />
            </div>
          )}
          {screen === 'rsvp-decision' && (
            <div key="rsvp-decision" className="absolute inset-0">
              <RSVPDecision
                onAttending={() => setScreen('rsvp-form-attending')}
                onNotAttending={() => setScreen('rsvp-form-regrets')}
                onClose={() => setScreen('chair')}
              />
            </div>
          )}
          {screen === 'rsvp-form-attending' && (
            <div key="rsvp-form-attending" className="absolute inset-0">
              <RSVPForm
                attending={true}
                onSubmit={(data) => handleRSVPSubmit(data, true)}
                onBack={() => setScreen('rsvp-decision')}
              />
            </div>
          )}
          {screen === 'rsvp-form-regrets' && (
            <div key="rsvp-form-regrets" className="absolute inset-0">
              <RSVPForm
                attending={false}
                onSubmit={(data) => handleRSVPSubmit(data, false)}
                onBack={() => setScreen('rsvp-decision')}
              />
            </div>
          )}
          {screen === 'confirmation' && (
            <div key="confirmation" className="absolute inset-0">
              <Confirmation guestName={guestName} />
            </div>
          )}
          {screen === 'regrets' && (
            <div key="regrets" className="absolute inset-0">
              <Regrets guestName={guestName} />
            </div>
          )}
          {screen === 'duplicate' && (
            <div
              key="duplicate"
              className="absolute inset-0 flex flex-col items-center justify-center px-8 text-center"
              style={{ background: 'rgba(253,249,243,0.97)' }}
            >
              <div
                className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-5"
                style={{ background: '#f5ede0', border: '2px solid #e8d5a3' }}
              >
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#c9a84c" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
                </svg>
              </div>
              <h2
                className="text-[24px] font-semibold mb-3"
                style={{ fontFamily: 'Cormorant Garamond, serif', color: '#2c2420' }}
              >
                We've already received your RSVP.
              </h2>
              <p
                className="text-[18px] italic"
                style={{ fontFamily: 'Cormorant Garamond, serif', color: '#5a4a40' }}
              >
                Thank you ❤️
              </p>
            </div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
