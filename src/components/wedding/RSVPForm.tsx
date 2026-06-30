import { motion } from 'framer-motion';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

const schema = z.object({
  fullName: z.string().min(2, 'Name is required'),
  email: z.string().email('Valid email required'),
  phone: z.string().optional(),
  guestCount: z.number().min(1).max(10),
});

export type RSVPFormValues = z.infer<typeof schema>;

interface RSVPFormProps {
  onSubmit: (data: RSVPFormValues) => void;
  onBack: () => void;
  attending: boolean;
}

const BG = 'https://firebasestorage.googleapis.com/v0/b/banani-prod.appspot.com/o/reference-images%2Fee3e746a-48b4-46f7-980b-17b9cac93870?alt=media&token=ddb6776b-257e-49c1-b642-0f32242d8932';

const GUEST_OPTIONS = [
  { value: 1, label: '1 — Just me' },
  { value: 2, label: '2 — Me + 1' },
  { value: 3, label: '3 guests' },
  { value: 4, label: '4 guests' },
  { value: 5, label: '5 guests' },
];

export default function RSVPForm({ onSubmit, onBack, attending }: RSVPFormProps) {
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<RSVPFormValues>({
    resolver: zodResolver(schema),
    defaultValues: { guestCount: 1 },
  });

  const guestCount = watch('guestCount');

  return (
    <motion.div
      className="relative w-full h-full overflow-hidden flex flex-col justify-end"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.35, ease: 'easeInOut' }}
    >
      <img src={BG} alt="Wedding background" className="absolute inset-0 w-full h-full object-cover" style={{ objectPosition: 'center 10%' }} />
      <div
        className="absolute inset-0"
        style={{ background: 'linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.04) 38%, rgba(250,245,238,0.7) 58%, rgba(250,245,238,0.97) 76%, rgba(250,245,238,1) 100%)' }}
      />

      <motion.div
        className="relative z-10 rounded-t-3xl shadow-2xl overflow-y-auto max-h-[88%]"
        style={{ background: 'linear-gradient(180deg, rgba(255,247,242,0.98) 0%, rgba(255,248,244,0.99) 100%)' }}
        initial={{ y: 90, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 80, opacity: 0 }}
        transition={{ delay: 0.15, duration: 0.65, type: 'spring', damping: 26, stiffness: 190 }}
      >
        <div className="px-[22px] pt-[26px] pb-7">
          <p
            className="text-[15px] italic text-center mb-2"
            style={{ fontFamily: 'Cormorant Garamond, serif', color: '#7a1a2e' }}
          >
            {attending ? 'Your Place Awaits' : "We'll Miss You"}
          </p>
          <h2
            className="text-[26px] font-semibold text-center leading-[1.1] mb-6"
            style={{ fontFamily: 'Cormorant Garamond, serif', color: '#2b2b2b', letterSpacing: '-0.02em' }}
          >
            {attending ? 'Claim Your Seat' : <>Let Us Know<br />Who You Are</>}
          </h2>

          <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
            {/* Full Name */}
            <div className="flex flex-col gap-2">
              <span
                className="text-[12px] font-semibold uppercase tracking-[0.12em]"
                style={{ fontFamily: 'Cormorant Garamond, serif', color: '#2b2b2b' }}
              >
                {attending ? 'Full Name' : 'Your Full Name'}
              </span>
              <input
                {...register('fullName')}
                placeholder="e.g. Amara Johnson"
                className="min-h-[52px] rounded-[18px] px-[18px] text-[16px] outline-none transition-all"
                style={{
                  fontFamily: 'Cormorant Garamond, serif',
                  background: '#fffbf9',
                  border: errors.fullName ? '2px solid #e8756a' : '2px solid #e8d5a3',
                  color: '#2b2b2b',
                  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.7)',
                }}
              />
              {errors.fullName && (
                <span className="text-[12px] text-[#e8756a]">{errors.fullName.message}</span>
              )}
            </div>

            {/* Email */}
            <div className="flex flex-col gap-2">
              <span
                className="text-[12px] font-semibold uppercase tracking-[0.12em]"
                style={{ fontFamily: 'Cormorant Garamond, serif', color: '#2b2b2b' }}
              >
                Email Address
              </span>
              <input
                {...register('email')}
                type="email"
                placeholder="you@example.com"
                className="min-h-[52px] rounded-[18px] px-[18px] text-[16px] outline-none transition-all"
                style={{
                  fontFamily: 'Cormorant Garamond, serif',
                  background: '#fffbf9',
                  border: errors.email ? '2px solid #e8756a' : '2px solid #e8d5a3',
                  color: '#2b2b2b',
                  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.7)',
                }}
              />
              {errors.email && (
                <span className="text-[12px] text-[#e8756a]">{errors.email.message}</span>
              )}
            </div>

            {attending && (
              <>
                {/* Phone */}
                <div className="flex flex-col gap-2">
                  <div className="flex items-baseline gap-1.5 flex-wrap">
                    <span
                      className="text-[12px] font-semibold uppercase tracking-[0.12em]"
                      style={{ fontFamily: 'Cormorant Garamond, serif', color: '#2b2b2b' }}
                    >
                      Phone Number
                    </span>
                    <span
                      className="text-[12px] italic"
                      style={{ fontFamily: 'Cormorant Garamond, serif', color: '#9a8b80' }}
                    >
                      (optional)
                    </span>
                  </div>
                  <input
                    {...register('phone')}
                    type="tel"
                    placeholder="+234 800 000 0000"
                    className="min-h-[52px] rounded-[18px] px-[18px] text-[16px] outline-none"
                    style={{
                      fontFamily: 'Cormorant Garamond, serif',
                      background: '#fffbf9',
                      border: '2px solid #e8d5a3',
                      color: '#2b2b2b',
                      boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.7)',
                    }}
                  />
                </div>

                {/* Guest count */}
                <div className="flex flex-col gap-2">
                  <span
                    className="text-[12px] font-semibold uppercase tracking-[0.12em]"
                    style={{ fontFamily: 'Cormorant Garamond, serif', color: '#2b2b2b' }}
                  >
                    Number of Guests (including yourself)
                  </span>
                  <div className="flex gap-2 flex-wrap">
                    {GUEST_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setValue('guestCount', opt.value)}
                        className="min-h-[52px] flex-1 min-w-[calc(50%-4px)] rounded-[18px] px-3 text-[15px] font-medium transition-all"
                        style={{
                          fontFamily: 'Cormorant Garamond, serif',
                          background: guestCount === opt.value ? '#c9a84c' : '#fffbf9',
                          border: guestCount === opt.value ? '2px solid #c9a84c' : '2px solid #e8d5a3',
                          color: guestCount === opt.value ? '#fff' : '#2b2b2b',
                          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.7)',
                        }}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}

            {/* Submit */}
            <button
              type="submit"
              className="mt-2 w-full min-h-[56px] rounded-full text-[16px] font-semibold text-white transition-opacity hover:opacity-90"
              style={{
                fontFamily: 'Cormorant Garamond, serif',
                background: attending ? '#e8756a' : '#5a4a40',
                boxShadow: attending ? '0 10px 24px rgba(232,117,106,0.22)' : 'none',
              }}
            >
              {attending ? 'Confirm My Attendance' : 'Send My Regrets'}
            </button>

            <button
              type="button"
              onClick={onBack}
              className="flex items-center gap-1.5 mx-auto text-[14px] mt-1"
              style={{ fontFamily: 'Cormorant Garamond, serif', color: '#5a4a40' }}
            >
              <span>←</span>
              <span>Go back</span>
            </button>
          </form>
        </div>
      </motion.div>
    </motion.div>
  );
}
