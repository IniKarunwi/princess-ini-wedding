import { motion } from "framer-motion";
import { ReactNode, useState } from "react";
import { ChevronDown } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

interface JobCardProps {
  title: string;
  role?: string;
  children: ReactNode;
  delay?: number;
  expandedContent?: ReactNode;
}

const JobCard = ({ title, role, children, delay = 0, expandedContent }: JobCardProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const isExpandable = !!expandedContent;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.5, delay }}
      whileHover={{ scale: 1.02, rotateX: 2 }}
      className="bg-card border border-border rounded-2xl hover:border-primary/50 transition-all duration-300"
    >
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger 
          className="w-full text-left p-6 cursor-pointer"
          disabled={!isExpandable}
        >
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <h3 className="text-2xl font-bold mb-2">{title}</h3>
              {role && <p className="text-primary font-medium mb-4">{role}</p>}
            </div>
            {isExpandable && (
              <ChevronDown 
                className={`w-6 h-6 text-muted-foreground transition-transform duration-300 ${
                  isOpen ? "rotate-180" : ""
                }`}
              />
            )}
          </div>
          
          <div className="text-muted-foreground space-y-3">
            {children}
          </div>
        </CollapsibleTrigger>

        {expandedContent && (
          <CollapsibleContent className="animate-accordion-down">
            <div className="px-4 pb-6 pt-4 md:px-8 md:pb-8 md:pt-6 mx-6 md:mx-6 mt-4 border-t border-border rounded-b-2xl bg-card/50">
              <div className="text-muted-foreground space-y-3 leading-relaxed" style={{ lineHeight: '1.6' }}>
                {expandedContent}
              </div>
            </div>
          </CollapsibleContent>
        )}
      </Collapsible>
    </motion.div>
  );
};

export default JobCard;
