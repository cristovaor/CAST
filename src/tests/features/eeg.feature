Feature: EEG Data
  As a researcher
  I want to upload and retrieve EEG data
  So that I can correlate brain activity with facial microactions

  Scenario: Upload EEG data proxy
    Given I am an authenticated user
    And a valid participant ID
    When I upload an EEG file via proxy
    Then the response status code should be 200
    And the response should contain an eeg_asset_id

  Scenario: Retrieve EEG timeseries
    Given I am an authenticated user
    And a valid participant ID
    And an uploaded EEG asset exists
    When I request the EEG timeseries
    Then the response status code should be 200
    And the response should contain timeseries data
