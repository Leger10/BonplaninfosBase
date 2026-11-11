import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/components/ui/use-toast';
import { Search, Download, ArrowUp, ArrowDown, Coins, Loader2, RefreshCw, AlertCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/lib/customSupabaseClient';
import { exportToExcel } from '@/lib/exportToExcel';

const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
const ITEMS_PER_PAGE = 50;
const TIMEOUT_MS = 10000;

const TransactionsTable = ({ country, initialTransactions }) => {
  // State
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [typeFilter, setTypeFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [retryCount, setRetryCount] = useState(0);

  // Cache
  const cache = useRef({});

  // Fetch Logic
  const fetchTransactions = useCallback(async (isLoadMore = false, currentRetry = 0) => {
    const startTime = performance.now();
    const cacheKey = `${country || 'all'}-${typeFilter}-${searchTerm}-${page}`;

    // Check Cache
    if (!isLoadMore && cache.current[cacheKey] && (Date.now() - cache.current[cacheKey].timestamp < CACHE_DURATION)) {
      console.log('Using cached transactions');
      setTransactions(cache.current[cacheKey].data);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Timeout Promise
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Request timed out')), TIMEOUT_MS)
      );

      // Data Query
      const fetchPromise = (async () => {
        let query;
        const from = page * ITEMS_PER_PAGE;
        const to = from + ITEMS_PER_PAGE - 1;

        if (country) {
          // Admin View (Filtered by Country)
          query = supabase
            .from('transactions')
            .select('*', { count: 'exact' })
            .eq('country', country)
            .order('created_at', { ascending: false })
            .range(from, to);

          if (typeFilter !== 'all') query = query.eq('transaction_type', typeFilter);
          if (searchTerm) query = query.ilike('description', `%${searchTerm}%`);

        } else {
          // Super Admin View (Coin Spending)
          // FIX: Removed 'status' from selection as it does not exist in coin_spending table
          query = supabase
            .from('coin_spending')
            .select(`
              id, amount, description, created_at, purpose,
              user:user_id (full_name, email)
            `, { count: 'exact' })
            .order('created_at', { ascending: false })
            .range(from, to);

          if (typeFilter !== 'all') query = query.eq('purpose', typeFilter);
          if (searchTerm) query = query.or(`description.ilike.%${searchTerm}%`);
        }

        const { data, error, count } = await query;
        if (error) throw error;
        return { data, count };
      })();

      // Race Query vs Timeout
      const { data, count } = await Promise.race([fetchPromise, timeoutPromise]);

      // Process Data
      const formattedData = data.map(t => ({
        id: t.id,
        user_full_name: t.user_full_name || t.user?.full_name || 'Utilisateur',
        user_email: t.user_email || t.user?.email || '-',
        description: t.description || t.purpose,
        amount: t.amount || t.amount_pi,
        type: t.type || t.purpose || t.transaction_type,
        created_at: t.created_at,
        // Handle status: use DB value if exists, otherwise default to 'completed' for coin_spending
        status: t.status || 'completed',
      }));

      setTransactions(prev => isLoadMore ? [...prev, ...formattedData] : formattedData);
      setHasMore(transactions.length + formattedData.length < count);

      // Update Cache
      cache.current[cacheKey] = {
        data: formattedData,
        timestamp: Date.now()
      };

      // Logs
      const duration = performance.now() - startTime;
      console.log(`Transactions fetched in ${duration.toFixed(2)}ms`);

    } catch (err) {
      console.error('Error fetching transactions:', err);

      // Retry Logic
      if (currentRetry < 3) {
        const backoffDelay = Math.pow(2, currentRetry) * 1000; // 1s, 2s, 4s
        console.log(`Retrying in ${backoffDelay}ms (Attempt ${currentRetry + 1}/3)...`);
        setTimeout(() => fetchTransactions(isLoadMore, currentRetry + 1), backoffDelay);
      } else {
        setError(err.message || "Erreur de chargement");
        toast({ title: "Erreur", description: "Impossible de charger les transactions.", variant: "destructive" });
      }
    } finally {
      setLoading(false);
    }
  }, [country, typeFilter, searchTerm, page]);

  // Initial Load & Filter Change
  useEffect(() => {
    setPage(0);
    fetchTransactions(false);
  }, [fetchTransactions]);

  // Export Function
  const handleExport = async () => {
    if (transactions.length === 0) {
      toast({ title: 'Aucune donnée à exporter', variant: 'destructive' });
      return;
    }

    const dataToExport = transactions.map(t => ({
      id: t.id,
      user: t.user_full_name,
      email: t.user_email,
      description: t.description,
      amount: t.amount,
      type: t.type,
      date: new Date(t.created_at).toLocaleString('fr-FR'),
      status: t.status,
    }));

    try {
      await exportToExcel({
        data: dataToExport,
        headers: [
          { label: 'ID', key: 'id' },
          { label: 'Utilisateur', key: 'user' },
          { label: 'Email', key: 'email' },
          { label: 'Description', key: 'description' },
          { label: 'Montant', key: 'amount' },
          { label: 'Type', key: 'type' },
          { label: 'Date', key: 'date' },
          { label: 'Statut', key: 'status' },
        ],
        sheetName: 'Transactions',
        fileName: `transactions_${new Date().toISOString().split('T')[0]}.xlsx`,
      });
      toast({ title: "Succès", description: "Exportation terminée." });
    } catch (error) {
      console.error("Erreur export Excel transactions:", error);
      toast({ title: "Erreur", description: "Exportation impossible.", variant: "destructive" });
    }
  };

  const getTransactionIcon = (amount) => {
    return amount > 0 ? <ArrowUp className="w-4 h-4 text-red-400" /> : <ArrowDown className="w-4 h-4 text-green-400" />;
  };

  const getTransactionColor = (amount) => {
    return amount > 0 ? 'text-red-400' : 'text-green-400';
  };

  return (
    <Card className="glass-effect shadow-lg rounded-xl border-primary/20">
      <CardHeader className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <CardTitle className="text-white flex items-center gap-2">
          💳 Transactions {loading && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
        </CardTitle>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => fetchTransactions(false)} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Actualiser
          </Button>
          <Button variant="outline" size="sm" onClick={handleExport}>
            <Download className="w-4 h-4 mr-2" />
            Exporter
          </Button>
        </div>
      </CardHeader>

      <CardContent>
        {/* Filters */}
        <div className="mb-6 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
            <Input
              type="text"
              placeholder="Rechercher..."
              className="pl-10 w-full"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger><SelectValue placeholder="Tous les types" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous les types</SelectItem>
              <SelectItem value="manual_credit">Crédit (Manuel)</SelectItem>
              <SelectItem value="raffle_ticket">Ticket Tombola</SelectItem>
              <SelectItem value="vote">Vote</SelectItem>
              <SelectItem value="ticket_purchase">Achat Ticket</SelectItem>
              <SelectItem value="stand_rental">Location Stand</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Error State */}
        {error && (
          <div className="p-4 mb-4 bg-destructive/10 border border-destructive/20 rounded-lg flex items-center justify-between text-destructive">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5" />
              <span>{error}</span>
            </div>
            <Button variant="outline" size="sm" onClick={() => fetchTransactions(false)} className="border-destructive/30 hover:bg-destructive/20">
              Réessayer
            </Button>
          </div>
        )}

        {/* Loading State (Initial) */}
        {loading && transactions.length === 0 ? (
          <div className="space-y-3">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
            <div className="text-center text-sm text-muted-foreground animate-pulse">Chargement des transactions...</div>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto rounded-md border border-gray-800">
              <table className="w-full text-sm">
                <thead className="text-xs text-gray-400 uppercase bg-black/20">
                  <tr>
                    <th className="px-6 py-3 text-left">ID</th>
                    <th className="px-6 py-3 text-left">Utilisateur</th>
                    <th className="px-6 py-3 text-left">Description</th>
                    <th className="px-6 py-3 text-left">Montant</th>
                    <th className="px-6 py-3 text-left">Date</th>
                    <th className="px-6 py-3 text-left">Statut</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {transactions.length > 0 ? (
                    transactions.map((transaction) => (
                      <tr key={transaction.id} className="hover:bg-white/5 transition-colors">
                        <td className="px-6 py-4 font-mono text-xs text-gray-500">
                          {transaction.id.slice(0, 8)}...
                        </td>
                        <td className="px-6 py-4">
                          <div className="font-medium text-white">{transaction.user_full_name}</div>
                          <div className="text-xs text-gray-500">{transaction.user_email}</div>
                        </td>
                        <td className="px-6 py-4 text-gray-300">
                          {transaction.description || transaction.type}
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-1">
                            {getTransactionIcon(transaction.amount)}
                            <span className={`font-bold ${getTransactionColor(transaction.amount)}`}>
                              {Math.abs(transaction.amount)}
                            </span>
                            <Coins className="w-3 h-3 text-yellow-500" />
                          </div>
                        </td>
                        <td className="px-6 py-4 text-gray-400">
                          {new Date(transaction.created_at).toLocaleDateString()}
                          <span className="block text-xs opacity-70">{new Date(transaction.created_at).toLocaleTimeString()}</span>
                        </td>
                        <td className="px-6 py-4">
                          <Badge variant={
                            transaction.status === 'completed' ? 'success' :
                              transaction.status === 'pending' ? 'warning' : 'destructive'
                          }>
                            {transaction.status}
                          </Badge>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan="6" className="px-6 py-8 text-center text-gray-500">
                        Aucune transaction trouvée
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination / Load More */}
            {hasMore && (
              <div className="mt-4 text-center">
                <Button
                  variant="secondary"
                  onClick={() => {
                    setPage(p => p + 1);
                    fetchTransactions(true);
                  }}
                  disabled={loading}
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                  Charger plus de transactions
                </Button>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default TransactionsTable;