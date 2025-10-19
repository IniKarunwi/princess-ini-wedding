import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect } from "react";

const StatsBar = () => {
  const stats = [
    { number: "5+", label: "years of experience" },
    { number: "$3M+", label: "ARR contributed" },
    { number: "60+", label: "projects built" },
  ];

  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % stats.length);
    }, 3000); // Change every 3 seconds

    return () => clearInterval(interval);
  }, []);

  return (
    <motion.section
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.6 }}
      className="w-full border-t border-b border-border/30 py-6 md:py-8 overflow-hidden"
      style={{ backgroundColor: '#1A1A1A' }}
    >
      <div className="max-w-6xl mx-auto px-6">
        <div className="flex items-center justify-center min-h-[80px]">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentIndex}
              initial={{ opacity: 0, x: 100 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -100 }}
              transition={{ 
                duration: 0.5,
                ease: "easeInOut"
              }}
              className="text-center"
            >
              <div className="text-4xl md:text-5xl font-bold mb-2" style={{ color: '#9FFF60' }}>
                {stats[currentIndex].number}
              </div>
              <div className="text-sm md:text-base text-muted-foreground">
                / {stats[currentIndex].label}
              </div>
            </motion.div>
          </AnimatePresence>
        </div>
        
        {/* Carousel indicators */}
        <div className="flex justify-center gap-2 mt-4">
          {stats.map((_, index) => (
            <button
              key={index}
              onClick={() => setCurrentIndex(index)}
              className="transition-all duration-300"
              aria-label={`Go to stat ${index + 1}`}
            >
              <div 
                className="h-1.5 rounded-full transition-all duration-300"
                style={{
                  width: currentIndex === index ? '32px' : '8px',
                  backgroundColor: currentIndex === index ? '#9FFF60' : '#444444'
                }}
              />
            </button>
          ))}
        </div>
      </div>
    </motion.section>
  );
};

export default StatsBar;
