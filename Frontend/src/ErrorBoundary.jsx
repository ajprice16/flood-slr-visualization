import React from 'react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    // Log for diagnostics
    console.error('[ErrorBoundary]', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{padding:'20px', fontFamily:'sans-serif'}}>
          <h2>Unexpected Error</h2>
          <pre style={{whiteSpace:'pre-wrap', background:'#eee', padding:'10px'}}>{String(this.state.error)}</pre>
          <button onClick={() => this.setState({hasError:false, error:null})}>Dismiss</button>
        </div>
      );
    }
    return this.props.children;
  }
}