import React, { Component } from "react";
import Config from "./Config";

import BillingAPI from "./modules/BillingAPI";

import "./App.css";

const APP_STATE_LOADING = "loading";
const APP_STATE_NOT_AUTHORIZED = "not_authorized";
const APP_STATE_ACCESS_DENIED = "access_denied";
const APP_STATE_ERROR = "error";
const APP_STATE_LOADED = "loaded";

class App extends Component {
  state = {
    accessToken: null,
    hasBillingAccess: false,
    appState: APP_STATE_LOADING,
    charges: null
  };

  fetchInterval = null;

  componentDidMount() {
    this.initApp();
  }

  async initApp() {
    this.accountsSdkInstance = window.AccountsSDK.init({
      client_id: Config.app_client_id,
      onIdentityFetched: async (error, data) => {
        if (error) {
          this.handleAuthError(error);
        } else {
          this.handleAuthSuccess(data.access_token, data.scopes);
        }
      }
    });
  }

  async handleAuthError(error) {
    console.warn(error);

    if (error.identity_exception === "unauthorized") {
      this.setState({
        appState: APP_STATE_NOT_AUTHORIZED
      });
    } else if (error.oauth_exception === "access_denied") {
      this.setState({
        appState: APP_STATE_ACCESS_DENIED
      });
    } else {
      this.setState({
        appState: APP_STATE_ERROR
      });
    }
  }

  async handleAuthSuccess(accessToken, scopes) {
    this.setState({
      accessToken: accessToken,
      hasBillingAccess: scopes.indexOf("billing_manage") > -1,
      charges: await this.fetchCharges(accessToken)
    });

    const chargeId = new URLSearchParams(document.location.search).get("id");
    if (chargeId) {
      const chargeConfirmed = await this.confirmCharge(accessToken, chargeId);
      if (chargeConfirmed) {
        // check if charge was successful every 15 seconds
        this.watchChargeStatusChange(chargeId);
      }
    }

    this.setState({
      appState: APP_STATE_LOADED
    });
  }

  watchChargeStatusChange(chargeId) {
    const updateChargeStatus = charge => {
      let state = this.state;
      let foundCharge = state.charges.find(c => c.id === charge.id);
      if (foundCharge) {
        foundCharge.status = charge.status;
        this.setState(state);
      }
    };

    const fetchCharge = chargeId => {
      return BillingAPI.fetchCharge(this.state.accessToken, chargeId)
        .then(charge => {
          updateChargeStatus(charge);
          if (charge.status === "success" || charge.status === "declined") {
            clearInterval(this.fetchInterval);
          }
        })
        .catch(error => {
          console.warn(error);
        });
    };

    this.fetchInterval = setInterval(async () => {
      fetchCharge(chargeId);
    }, 5000);

    fetchCharge(chargeId);
  }

  async fetchCharges(accessToken = this.state.accessToken) {
    return BillingAPI.fetchCharges(accessToken)
      .then(response => response.result)
      .catch(error => {
        console.warn(error);
      });
  }

  async confirmCharge(accessToken, chargeId) {
    return BillingAPI.confirmCharge(accessToken, chargeId)
      .then(response => true)
      .catch(error => {
        console.warn(error);
      });
  }

  handleSignoutClick(e) {
    e.preventDefault();

    this.accountsSdkInstance.signOut(() => {
      this.setState({
        appState: APP_STATE_NOT_AUTHORIZED
      });
    });
  }

  handleBuyClick() {
    BillingAPI.createCharge(
      this.state.accessToken,
      Config.app_url,
      "Item XYZ",
      125,
      1
    )
      .then(response => {
        window.location.href = response.confirmation_url;
      })
      .catch(error => console.warn(error));
  }

  render() {
    if (this.state.appState !== APP_STATE_LOADED) {
      return (
        <div className="App">
          {this.state.appState === APP_STATE_LOADING && <p>Loading…</p>}
          {this.state.appState === APP_STATE_NOT_AUTHORIZED && (
            <div>
              <p>
                You must sign in with your LiveChat account before you can make
                a test purchase.
              </p>
              <div
                className="livechat-login-button"
                ref={ref => this.accountsSdkInstance.displayButtons()}
              />
            </div>
          )}
          {this.state.appState === APP_STATE_ACCESS_DENIED && (
            <div>
              <p>Access denied.</p>
              <p>
                Probably this application is installed on a different account
                and you do not have access to it.
              </p>
              <p>
                <button onClick={this.handleSignoutClick.bind(this)}>
                  Sign out
                </button>
              </p>
            </div>
          )}
          {this.state.appState === APP_STATE_ERROR && (
            <div>
              <p>
                Something is wrong. Check developer tools console to see error
                details.
              </p>
              <p>
                <button onClick={this.handleSignoutClick.bind(this)}>
                  Sign out
                </button>
              </p>
            </div>
          )}
        </div>
      );
    }

    if (this.state.appState === APP_STATE_LOADED) {
      return (
        <div className="App">
          {!this.state.charges && <p>Loading…</p>}
          {this.state.charges && (
            <div>
              {this.state.charges.length > 0 && (
                <table>
                  <caption>Latest charges</caption>
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>created</th>
                      <th>status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {this.state.charges.map(charge => (
                      <tr key={charge.id}>
                        <td>{charge.id}</td>
                        <td>{charge.created_at}</td>
                        <td>{charge.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              <hr />
              {this.state.hasBillingAccess && (
                <p>
                  <button onClick={this.handleBuyClick.bind(this)}>
                    Make a test payment for <strong>$1.25</strong>
                  </button>{" "}
                  or{" "}
                  <a href="" onClick={this.handleSignoutClick.bind(this)}>
                    Sign out
                  </a>
                </p>
              )}
              {!this.state.hasBillingAccess && (
                <div>
                  <p>
                    You do not have permission to make a purchase. Only license
                    owners can do that.
                  </p>
                  <p>
                    <button onClick={this.handleSignoutClick.bind(this)}>
                      Sign out
                    </button>
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      );
    }
  }
}

export default App;
