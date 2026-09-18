import { QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter as Router, Route, Routes } from "react-router-dom";
import { Toaster } from "@/components/ui/toaster";
import { queryClientInstance } from "@/lib/query-client";
import AppShell from "@/components/AppShell";
import ScrollToTop from "@/components/ScrollToTop";
import PageNotFound from "@/lib/PageNotFound";
import Admin from "@/pages/Admin";
import Bocha from "@/pages/Bocha";
import Cashier from "@/pages/Cashier";
import CoinFlip from "@/pages/CoinFlip";
import Dama from "@/pages/Dama";
import Futebol from "@/pages/Futebol";
import Home from "@/pages/Home";
import Sinuca from "@/pages/Sinuca";
import Truco from "@/pages/Truco";
import Wallet from "@/pages/Wallet";

function App() {
  return (
    <QueryClientProvider client={queryClientInstance}>
      <Router>
        <ScrollToTop />
        <Routes>
          <Route element={<AppShell />}>
            <Route path="/" element={<Home />} />
            <Route path="/dama" element={<Dama />} />
            <Route path="/bocha" element={<Bocha />} />
            <Route path="/futebol" element={<Futebol />} />
            <Route path="/coinflip" element={<CoinFlip />} />
            <Route path="/sinuca" element={<Sinuca />} />
            <Route path="/truco" element={<Truco />} />
            <Route path="/wallet" element={<Wallet />} />
            <Route path="/cashier" element={<Cashier />} />
            <Route path="/admin" element={<Admin />} />
          </Route>
          <Route path="*" element={<PageNotFound />} />
        </Routes>
      </Router>
      <Toaster />
    </QueryClientProvider>
  );
}

export default App;
