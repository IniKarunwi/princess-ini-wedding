import { motion } from 'framer-motion';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

const schema = z.object({
  fullName:            z.string().min(2, 'Name is required'),
  email:               z.string().email('Valid email required'),
  phone:               z.string().optional(),
  plusOneRequested:    z.boolean(),
  plusOneName:         z.string().optional(),
  plusOneRelationship: z.string().optional(),
}).superRefine((data, ctx) => {
  if (data.plusOneRequested) {
    if (!data.plusOneName || data.plusOneName.trim().length < 2) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['plusOneName'], message: 'Guest name is required' });
    }
    if (!data.plusOneRelationship) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['plusOneRelationship'], message: 'Please select a relationship' });
    }
  }
});

export type RSVPFormValues = z.infer<typeof schema>;

interface RSVPFormProps {
  onSubmit: (data: RSVPFormValues) => Promise<void>;
  onBack: () => void;
  attending: boolean;
}

const RELATIONSHIP_OPTIONS = [
  'Spouse',
  'Fiancé / Fiancée',
  'Family',
  'Friend',
  'Other',
];

const inputStyle = (hasError?: boolean) => ({
  fontFamily: 'Cormorant Garamond, serif',
  background: '#fffbf9',
  border: hasError ? '2px solid #e8756a' : '2px solid #e8d5a3',
  color: '#2b2b2b',
  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.7)',
});

const labelStyle = {
  fontFamily: 'Cormorant Garamond, serif',
  color: '#2b2b2b',
};

export default function RSVPForm({ onSubmit, onBack, attending }: RSVPFormProps) {
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<RSVPFormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      plusOneRequested:    false,
      plusOneName:         '',
      plusOneRelationship: '',
    },
  });

  const plusOneRequested    = watch('plusOneRequested');
  const plusOneRelationship = watch('plusOneRelationship');

  return (
    <motion.div
      className="relative w-full h-full flex flex-col justify-end"
      initial={{ opacity: 1 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
    >
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
              <span className="text-[12px] font-semibold uppercase tracking-[0.12em]" style={labelStyle}>
                Full Name
              </span>
              <input
                {...register('fullName')}
                placeholder="e.g. Amara Johnson"
                className="min-h-[52px] rounded-[18px] px-[18px] text-[16px] outline-none transition-all"
                style={inputStyle(!!errors.fullName)}
              />
              {errors.fullName && (
                <span className="text-[12px] text-[#e8756a]">{errors.fullName.message}</span>
              )}
            </div>

            {/* Email */}
            <div className="flex flex-col gap-2">
              <span className="text-[12px] font-semibold uppercase tracking-[0.12em]" style={labelStyle}>
                Email Address
              </span>
              <input
                {...register('email')}
                type="email"
                placeholder="you@example.com"
                className="min-h-[52px] rounded-[18px] px-[18px] text-[16px] outline-none transition-all"
                style={inputStyle(!!errors.email)}
              />
              {errors.email && (
                <span className="text-[12px] text-[#e8756a]">{errors.email.message}</span>
              )}
            </div>

            {/* Phone — always shown, optional */}
            <div className="flex flex-col gap-2">
              <div className="flex items-baseline gap-1.5">
                <span className="text-[12px] font-semibold uppercase tracking-[0.12em]" style={labelStyle}>
                  Phone Number
                </span>
                <span className="text-[12px] italic" style={{ fontFamily: 'Cormorant Garamond, serif', color: '#9a8b80' }}>
                  (optional)
                </span>
              </div>
              <input
                {...register('phone')}
                type="tel"
                placeholder="+234 800 000 0000"
                className="min-h-[52px] rounded-[18px] px-[18px] text-[16px] outline-none"
                style={inputStyle()}
              />
            </div>

            {/* +1 section — attending guests only */}
            {attending && (
              <div
                className="flex flex-col gap-3 rounded-[18px] p-4"
                style={{ background: '#fdf6ee', border: '1.5px solid #e8d5a3' }}
              >
                <span className="text-[12px] font-semibold uppercase tracking-[0.12em]" style={labelStyle}>
                  Will you be bringing a guest?
                </span>

                {/* Stacked card selector */}
                <div className="flex flex-col gap-2">
                  {([
                    { value: false, label: 'No' },
                    { value: true,  label: "I'd like to request a +1" },
                  ] as const).map(opt => {
                    const selected = plusOneRequested === opt.value;
                    return (
                      <button
                        key={String(opt.value)}
                        type="button"
                        onClick={() => {
                          setValue('plusOneRequested', opt.value, { shouldValidate: true });
                          if (!opt.value) {
                            setValue('plusOneName', '');
                            setValue('plusOneRelationship', '');
                          }
                        }}
                        className="w-full flex items-center gap-3 px-4 py-[14px] rounded-[16px] text-left transition-all"
                        style={{
                          fontFamily: 'Cormorant Garamond, serif',
                          background: selected ? 'rgba(201,168,76,0.08)' : '#fffbf9',
                          border:     selected ? '2px solid #c9a84c' : '2px solid #e8d5a3',
                          boxShadow:  selected
                            ? '0 2px 12px rgba(201,168,76,0.14)'
                            : 'inset 0 1px 0 rgba(255,255,255,0.7)',
                        }}
                      >
                        <span
                          className="flex-shrink-0 w-[18px] h-[18px] rounded-full flex items-center justify-center"
                          style={{
                            border: selected ? '2px solid #c9a84c' : '2px solid #c8baa8',
                            background: selected ? '#c9a84c' : 'transparent',
                            transition: 'all 0.18s ease',
                          }}
                        >
                          {selected && <span className="w-[6px] h-[6px] rounded-full" style={{ background: '#fff' }} />}
                        </span>
                        <span className="text-[15px] font-medium" style={{ color: selected ? '#2b2b2b' : '#4a3e36' }}>
                          {opt.label}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {/* Guest detail fields — only when +1 requested */}
                {plusOneRequested && (
                  <motion.div
                    className="flex flex-col gap-3"
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                  >
                    {/* Guest Name */}
                    <div className="flex flex-col gap-1.5">
                      <span className="text-[12px] font-semibold uppercase tracking-[0.12em]" style={labelStyle}>
                        Guest's Full Name
                      </span>
                      <input
                        {...register('plusOneName')}
                        placeholder="e.g. James Johnson"
                        className="min-h-[52px] rounded-[18px] px-[18px] text-[16px] outline-none transition-all"
                        style={inputStyle(!!errors.plusOneName)}
                      />
                      {errors.plusOneName && (
                        <span className="text-[12px] text-[#e8756a]">{errors.plusOneName.message}</span>
                      )}
                    </div>

                    {/* Relationship */}
                    <div className="flex flex-col gap-1.5">
                      <span className="text-[12px] font-semibold uppercase tracking-[0.12em]" style={labelStyle}>
                        Relationship
                      </span>
                      <div className="flex gap-2 flex-wrap">
                        {RELATIONSHIP_OPTIONS.map(rel => (
                          <button
                            key={rel}
                            type="button"
                            onClick={() => setValue('plusOneRelationship', rel, { shouldValidate: true })}
                            className="min-h-[44px] flex-1 min-w-[calc(50%-4px)] rounded-[14px] px-3 text-[14px] font-medium transition-all"
                            style={{
                              fontFamily: 'Cormorant Garamond, serif',
                              background: plusOneRelationship === rel ? '#c9a84c' : '#fffbf9',
                              border:     plusOneRelationship === rel ? '2px solid #c9a84c' : '2px solid #e8d5a3',
                              color:      plusOneRelationship === rel ? '#fff' : '#2b2b2b',
                              boxShadow:  'inset 0 1px 0 rgba(255,255,255,0.7)',
                            }}
                          >
                            {rel}
                          </button>
                        ))}
                      </div>
                      {errors.plusOneRelationship && (
                        <span className="text-[12px] text-[#e8756a]">{errors.plusOneRelationship.message}</span>
                      )}
                    </div>

                    {/* Approval notice */}
                    <p
                      className="text-[12px] italic leading-relaxed"
                      style={{ fontFamily: 'Cormorant Garamond, serif', color: '#9a8b80' }}
                    >
                      +1 requests are subject to availability and approval. We'll confirm your guest reservation before the wedding.
                    </p>
                  </motion.div>
                )}
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={isSubmitting}
              className="mt-2 w-full min-h-[56px] rounded-full text-[16px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
              style={{
                fontFamily: 'Cormorant Garamond, serif',
                background:  attending ? '#e8756a' : '#5a4a40',
                boxShadow:   attending ? '0 10px 24px rgba(232,117,106,0.22)' : 'none',
              }}
            >
              {isSubmitting
                ? (attending ? 'Saving…' : 'Sending…')
                : (attending ? 'Confirm My Attendance' : 'Send My Regrets')}
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
