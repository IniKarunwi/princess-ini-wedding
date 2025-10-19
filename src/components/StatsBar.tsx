import { motion } from "framer-motion";
import { useState } from "react";

const StatsBar = () => {
  const [isPaused, setIsPaused] = useState(false);
  
  const stats = [
    { number: "$3M+", label: "ARR contributed" },
    { number: "60+", label: "projects built" },
    { number: "5+", label: "years of experience" },
  ];

  // Duplicate stats multiple times for seamless infinite loop
  const duplicatedStats = [...stats, ...stats, ...stats, ...stats];

  return (
    <motion.section
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.6 }}
      className="w-full border-t border-b border-border/30 overflow-hidden"
      style={{ 
        backgroundColor: '#1A1A1A',
        height: '60px'
      }}
    >
      <motion.div
        className="flex items-center h-full gap-8 md:gap-12"
        animate={{
          x: isPaused ? undefined : [0, '-50%'],
        }}
        transition={{
          x: {
            repeat: Infinity,
            repeatType: "loop",
            duration: 30,
            ease: "linear",
          },
        }}
        onMouseEnter={() => setIsPaused(true)}
        onMouseLeave={() => setIsPaused(false)}
        style={{ cursor: 'grab' }}
      >
        {duplicatedStats.map((stat, index) => (
          <div key={index} className="flex items-center gap-8 md:gap-12 flex-shrink-0">
            <div className="flex items-baseline gap-2 whitespace-nowrap px-4">
              <span className="text-2xl md:text-3xl font-bold" style={{ color: '#9FFF60' }}>
                {stat.number}
              </span>
              <span className="text-xs md:text-sm" style={{ color: '#9CA3AF' }}>
                / {stat.label}
              </span>
            </div>
            <div className="text-lg" style={{ color: '#9FFF60' }}>
              ✦
            </div>
          </div>
        ))}
      </motion.div>
    </motion.section>
  );
};

export default StatsBar;
