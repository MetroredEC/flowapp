import React from 'react';

type Props = {
 children: React.ReactNode;
};

type State = {
 hasError: boolean;
 message: string;
 stack: string;
};

export default class ErrorBoundary extends React.Component<Props, State> {
 state: State = {
  hasError: false,
  message: '',
  stack: '',
 };

 static getDerivedStateFromError(error: Error): State {
  return {
   hasError: true,
   message: error.message || 'Error inesperado',
   stack: error.stack || '',
  };
 }

 componentDidCatch(error: Error, info: React.ErrorInfo) {
  console.error('FlowApp error boundary', error, info);
 }

 copyDetails = async () => {
  const detail = [
   'FlowApp error',
   this.state.message,
   '',
   this.state.stack,
  ].join('\n');

  try {
   await navigator.clipboard.writeText(detail);
   alert('Detalle tecnico copiado.');
  } catch {
   alert(detail);
  }
 };

 reload = () => {
  window.location.reload();
 };

 goHome = () => {
  window.location.href = '/flowapp/';
 };

 render() {
  if (!this.state.hasError) {
   return this.props.children;
  }

  return (
   <div style={page}>
    <div style={card}>
     <div style={icon}>!</div>

     <h1 style={title}>Algo no salio como esperabamos</h1>

     <p style={text}>
      Puedes intentar nuevamente. Si el problema continua, copia el detalle tecnico y compartelo con Tecnologia.
     </p>

     <div style={errorBox}>
      {this.state.message || 'Error inesperado'}
     </div>

     <div style={actions}>
      <button onClick={this.reload} style={primaryButton}>
       Reintentar
      </button>

      <button onClick={this.goHome} style={secondaryButton}>
       Volver al inicio
      </button>

      <button onClick={this.copyDetails} style={ghostButton}>
       Copiar detalle
      </button>
     </div>
    </div>
   </div>
  );
 }
}

const page: React.CSSProperties = {
 minHeight: '100vh',
 display: 'grid',
 placeItems: 'center',
 padding: 24,
 background: 'linear-gradient(135deg, #F6F9FC 0%, #EEF4FA 50%, #F7F7F4 100%)',
};

const card: React.CSSProperties = {
 width: 'min(520px, 100%)',
 display: 'grid',
 gap: 14,
 padding: 24,
 borderRadius: 22,
 background: '#FFFFFF',
 border: '1px solid #EAECF0',
 boxShadow: '0 24px 80px rgba(16,24,40,.14)',
 textAlign: 'center',
};

const icon: React.CSSProperties = {
 width: 54,
 height: 54,
 borderRadius: '50%',
 display: 'grid',
 placeItems: 'center',
 margin: '0 auto',
 background: '#FFF2EC',
 color: '#D92D20',
 fontSize: 24,
 fontWeight: 900,
};

const title: React.CSSProperties = {
 margin: 0,
 fontSize: 24,
 fontWeight: 900,
 color: '#101828',
};

const text: React.CSSProperties = {
 margin: 0,
 color: '#667085',
 fontSize: 14,
 lineHeight: 1.55,
};

const errorBox: React.CSSProperties = {
 padding: 12,
 borderRadius: 12,
 background: '#F8FAFC',
 border: '1px solid #EAECF0',
 color: '#344054',
 fontSize: 13,
 fontWeight: 700,
 textAlign: 'left',
 overflowWrap: 'anywhere',
};

const actions: React.CSSProperties = {
 display: 'flex',
 gap: 10,
 flexWrap: 'wrap',
 justifyContent: 'center',
};

const primaryButton: React.CSSProperties = {
 background: '#0C447C',
 color: '#FFFFFF',
 border: '1px solid #0C447C',
 borderRadius: 999,
 padding: '10px 14px',
 fontWeight: 800,
 cursor: 'pointer',
};

const secondaryButton: React.CSSProperties = {
 background: '#FFFFFF',
 color: '#185FA5',
 border: '1px solid #B5D4F4',
 borderRadius: 999,
 padding: '10px 14px',
 fontWeight: 800,
 cursor: 'pointer',
};

const ghostButton: React.CSSProperties = {
 background: '#F8FAFC',
 color: '#344054',
 border: '1px solid #D0D5DD',
 borderRadius: 999,
 padding: '10px 14px',
 fontWeight: 800,
 cursor: 'pointer',
};
