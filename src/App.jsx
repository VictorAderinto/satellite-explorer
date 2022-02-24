import { Map } from './components/Map';
import { Loading } from './components/Loading';
import { Stories } from './components/Stories';
import { PageNotFound } from './components/PageNotFound';
import appStore from './stores/AppStore';
import { observer } from 'mobx-react';
import { Routes, Route, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import { SatelliteUsage } from './components/SatelliteUsage';
import { SatelliteNumber } from './components/SatelliteNumber';
import { SatelliteInternet } from './components/SatelliteInternet';

const App = observer(() => {
  let location = useLocation();
  useEffect(() => {
    appStore.setLocation(location);
  }, [location]);
  return (
    <>
      <Routes>
        <Route path='/' element={<Map map={appStore.map} />}>
          <Route path='*' element={<PageNotFound />} />
          <Route index element={<Stories />} />
          <Route path='satellite-usage' element={<SatelliteUsage />} />
          <Route path='satellite-number' element={<SatelliteNumber />} />
          <Route path='satellite-internet' element={<SatelliteInternet />} />
        </Route>
      </Routes>
      {!appStore.viewIsReady && <Loading></Loading>}
    </>
  );
});

export default App;
