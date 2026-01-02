/**
 * Admin Summary Cards Component
 * 
 * Displays top-level stats for admin dashboard.
 */

import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Users, FolderOpen, FileText, Link2, Loader2 } from 'lucide-react';

interface Stats {
  users: number;
  spaces: number;
  documents: number;
  links: number;
}

export function AdminSummaryCards() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      const [usersRes, spacesRes, documentsRes, linksRes] = await Promise.all([
        supabase.from('profiles').select('id', { count: 'exact', head: true }),
        supabase.from('spaces').select('id', { count: 'exact', head: true }),
        supabase.from('documents').select('id', { count: 'exact', head: true }),
        supabase.from('share_links').select('id', { count: 'exact', head: true }),
      ]);

      setStats({
        users: usersRes.count || 0,
        spaces: spacesRes.count || 0,
        documents: documentsRes.count || 0,
        links: linksRes.count || 0,
      });
    } catch (error) {
      console.error('Failed to fetch stats:', error);
    } finally {
      setLoading(false);
    }
  };

  const cards = [
    { label: 'Users', value: stats?.users || 0, icon: Users, color: 'bg-primary/20 text-primary' },
    { label: 'Spaces', value: stats?.spaces || 0, icon: FolderOpen, color: 'bg-success/20 text-success' },
    { label: 'Documents', value: stats?.documents || 0, icon: FileText, color: 'bg-warning/20 text-warning' },
    { label: 'Share Links', value: stats?.links || 0, icon: Link2, color: 'bg-info/20 text-info' },
  ];

  if (loading) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i} className="animate-pulse">
            <CardContent className="p-4">
              <div className="h-16 bg-muted rounded" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
      {cards.map((card) => (
        <Card key={card.label} className="hover:shadow-md transition-shadow">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${card.color}`}>
                <card.icon className="w-6 h-6" />
              </div>
              <div>
                <p className="text-2xl font-bold">{card.value.toLocaleString()}</p>
                <p className="text-sm text-muted-foreground">{card.label}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
