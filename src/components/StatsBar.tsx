import { motion } from "framer-motion";

const StatsBar = () => {
  const stats = [
    { number: "5+", label: "years of experience" },
    { number: "$3M+", label: "ARR contributed" },
    { number: "60+", label: "projects built" },
  ];

  // Duplicate stats for infinite loop effect
  const duplicatedStats = [...stats, ...stats];

  return (
    <motion.section
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.6 }}
      className="w-full border-t border-b border-border/30 py-3 md:py-5 overflow-hidden"
      style={{ backgroundColor: '#1A1A1A' }}
    >
      <motion.div
        className="flex items-center gap-6 md:gap-12"
        animate={{
          x: [0, -50 + '%'],
        }}
        transition={{
          x: {
            repeat: Infinity,
            repeatType: "loop",
            duration: 20,
            ease: "linear",
          },
        }}
      >
        {duplicatedStats.map((stat, index) => (
          <div key={index} className="flex items-center gap-6 md:gap-12 flex-shrink-0">
            <div className="text-center whitespace-nowrap px-8">
              <div className="text-2xl md:text-3xl font-bold mb-1" style={{ color: '#9FFF60' }}>
                {stat.number}
              </div>
              <div className="text-xs md:text-sm text-muted-foreground">
                / {stat.label}
              </div>
            </div>
            <div className="text-xl md:text-2xl" style={{ color: '#9FFF60' }}>
              ✦
            </div>
          </div>
        ))}
      </motion.div>
    </motion.section>
  );
};

export default StatsBar;
